pragma solidity ^0.4.13;

contract LuckyEnvelope {

	// ------------------------------
  	// config
  	// TODO: update
  	// ------------------------------
  	uint private default_dev_tip_pct = 2;
  	uint private default_refund_pct = 2;
  	uint private min_since_last_claim = 360; // seconds 
  	uint private min_wei = 6000000000000000; // 0.006 eth 
  	uint private max_wei = 100000000000000000000; // 100 eth
  	uint private max_transaction_fee = 1000000000000000000; // 1 eth

	// ------------------------------
  	// envelope struct & mappings
  	// ------------------------------
  	enum EnvelopeStatus { Created, Claimed, Empty }

	struct Envelope {
		uint id;
		bool passEnable;
		EnvelopeStatus status;
		bytes32 hash;
		address tempAddr;
		address creatorAddr;
		string creatorName;
		uint endTime;
		uint initialBalance;
		uint remainingBalance;
		string messageLink;
		uint maxClaims;
		uint totalClaims;
		uint lastClaimTime;
		mapping (address => uint) claims;
	}

	mapping (uint => Envelope) private envelopes;

	// ------------------------------
  	// constructor 
  	// ------------------------------
  	uint public envelopeIndex;
  	address public devAddr;

  	// TODO: update
	function LuckyEnvelope() public {
		envelopeIndex = 0;
		devAddr = 0xb9701545E7bf1c75f949C01DB12c0e23aADA752a; 
	} 

	// ------------------------------
  	// modifiers
  	// ------------------------------
  	modifier notEnded(uint _id) {
		require (envelopes[_id].endTime > now && envelopes[_id].remainingBalance > 0);
		_;
	}

	modifier notEmpty(uint _id) {
		require (envelopes[_id].status != EnvelopeStatus.Empty);
		_;
	}

	modifier expired(uint _id) {
		require (envelopes[_id].endTime <= now);
		_;
	}

	modifier requireClaimerNotClaimed(uint _id, address _claimerAddr) {
		require (envelopes[_id].claims[_claimerAddr] == 0);
		_;
	}

	modifier requireTempAddrMatch(uint _id, address _newTempAddr) {
		require (envelopes[_id].tempAddr == _newTempAddr && envelopes[_id].tempAddr == msg.sender);
		_;
	}

	modifier requireMinSinceLastClaim(uint _id) {
		if (envelopes[_id].lastClaimTime > 0) {
			require (now - envelopes[_id].lastClaimTime >= min_since_last_claim);
		}
		_;
	}

	// ------------------------------
  	// events
  	// ------------------------------
	event EnvelopeCreated(uint _id, address indexed _from, address _temp);
	event EnvelopeClaimed(uint indexed _id, address indexed _from, uint _value);
	event EnvelopeRefunded(uint _id, address indexed _from, uint _value);

	// ------------------------------
  	// main functions
  	// ------------------------------
	// fallback 
	function() public payable {
		revert();
	}

	// create new envelope
	function newEnvelope(bool _passEnable, string _password, address _tempAddr, string _name, uint _endTime, string _messageLink, uint _maxClaims, uint _feeAmount, bool _devTip) payable public {
		require (msg.value >= min_wei);
		require (msg.value <= max_wei);
		require (now < _endTime);
		require (_maxClaims >= 1);
		require (_tempAddr != 0x0);
		require (_feeAmount < max_transaction_fee);

		envelopeIndex += 1;
		uint amount = msg.value;
		uint tipAmount = 0;
		
		Envelope memory env;
		env.id = envelopeIndex;
		env.passEnable = _passEnable;
		if (env.passEnable) {
			env.hash = keccak256(envelopeIndex, msg.sender, _password);
		}
		env.tempAddr = _tempAddr;
		if (_devTip) {
			tipAmount = (amount * default_dev_tip_pct / 100);
			amount -= tipAmount;
		}
		env.creatorAddr = msg.sender;
		env.creatorName = _name;
		env.endTime = _endTime;
		env.initialBalance = amount - _feeAmount;
		env.remainingBalance = env.initialBalance;
		env.messageLink = _messageLink;
		env.maxClaims = _maxClaims;
		env.status = EnvelopeStatus.Created;
		envelopes[envelopeIndex] = env;
		
		EnvelopeCreated(envelopeIndex, msg.sender, _tempAddr);
		_tempAddr.transfer(_feeAmount);
		devAddr.transfer(tipAmount);
	}
	
	// check and update envelope based on claim 
	function claimEnvelope(uint _id, address _newTempAddr, address _claimerAddr, string _password) public 
	requireTempAddrMatch(_id, _newTempAddr)
	notEnded(_id)
	requireClaimerNotClaimed(_id, _claimerAddr)
	requireMinSinceLastClaim(_id)
	{
		if (envelopes[_id].passEnable) {
			require (checkPassword(_id, _password));
		}		
		uint claimAmount = envelopes[_id].remainingBalance;
		if (envelopes[_id].maxClaims - envelopes[_id].totalClaims > 1) {
			claimAmount = generateClaimAmount(envelopes[_id].remainingBalance, (envelopes[_id].maxClaims - 1));
		} 
		envelopes[_id].totalClaims += 1;
		envelopes[_id].claims[_claimerAddr] = claimAmount;
		envelopes[_id].lastClaimTime = now;
		envelopes[_id].remainingBalance -= claimAmount;
		envelopes[_id].status = EnvelopeStatus.Claimed;
		if (envelopes[_id].remainingBalance == 0) {
			envelopes[_id].status = EnvelopeStatus.Empty;
		}	
		EnvelopeClaimed(_id, _claimerAddr, claimAmount);	
		_claimerAddr.transfer(claimAmount);	
	}

	// refund envelope when expired
	function refundEnvelope(uint _id) public 
	expired(_id)
	notEmpty(_id)
	{
		uint refundFee = envelopes[_id].remainingBalance * default_refund_pct / 100;
		uint refundAmount = envelopes[_id].remainingBalance - refundFee;
		envelopes[_id].remainingBalance = 0;
		envelopes[_id].status = EnvelopeStatus.Empty;
		EnvelopeRefunded(_id, envelopes[_id].creatorAddr, refundAmount);
		envelopes[_id].creatorAddr.transfer(refundAmount);
		devAddr.transfer(refundFee);
	}

	// check password 
	function checkPassword(uint _id, string _password) public view returns (bool) {
		if (envelopes[_id].hash == keccak256(_id, envelopes[_id].creatorAddr, _password)) {
			return true;
		} 
		return false;
	}

	// ------------------------------
  	// getters
  	// ------------------------------
	function getEnvelopeStatus(uint _id) public view returns (EnvelopeStatus, bool, address, uint) {
		return (envelopes[_id].status, envelopes[_id].passEnable, envelopes[_id].creatorAddr, envelopes[_id].endTime);
	}

	function getEnvelopeInfo(uint _id) public view returns (string, string, uint, uint) {
		uint nextClaimTime = envelopes[_id].lastClaimTime + min_since_last_claim;
		return (envelopes[_id].creatorName, envelopes[_id].messageLink, envelopes[_id].totalClaims, nextClaimTime);
	}

	function getEnvelopeReveal(uint _id) public view 
	returns (uint, uint, uint) {
		return (envelopes[_id].maxClaims, envelopes[_id].initialBalance, envelopes[_id].remainingBalance);
	}

	function getClaimInfo(uint _id, address _claimer) public view 
	returns (uint) {
		return envelopes[_id].claims[_claimer];
	}

	// helper
	function generateClaimAmount(uint _remain, uint _portion) private constant returns (uint) {	
		uint amount = uint(block.blockhash(block.number-1)) % (_remain / _portion) + (_remain / _portion * 10 / 100);
		require (amount > 0);
		require (amount <= _remain);
		return amount;
	}
}
