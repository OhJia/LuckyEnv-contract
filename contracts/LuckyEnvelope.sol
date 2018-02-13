pragma solidity ^0.4.13;

contract LuckyEnvelope {

	// ------------------------------
  	// config
  	// ------------------------------
  	uint private default_dev_tip_pct = 1;
  	uint private min_since_last_claim = 6; // minutes
  	uint private min_wei = 1000000000000000000 * 0.006; 
  	uint private max_wei = 1000000000000000000 * 100; 

	// ------------------------------
  	// object struct & mappings
  	// ------------------------------

	struct Envelope {
		uint id;
		bytes32 hash;
		address creatorAddress;
		string creatorName;
		uint startTime;
		uint endTime;
		uint initialBalance;
		uint remainingBalance;
		string messageLink;
		uint devTipPct;
		uint maxClaims;
		uint totalClaims;
		uint lastClaimTime;
		bool reveal;
		mapping (address => uint) claims;
	}

	mapping (uint => Envelope) private envelopes;
	mapping (string => address) private creators;

	// ------------------------------
  	// constructor 
  	// ------------------------------
  	uint public envelopeIndex;
  	address public devAddress;

	function LuckyEnvelope() public {
		envelopeIndex = 0;
		devAddress = 0xb9701545E7bf1c75f949C01DB12c0e23aADA752a;
	}

	// ------------------------------
  	// modifiers
  	// ------------------------------
  	modifier notExpired(uint _id) {
		require (envelopes[_id].endTime > now);
		_;
	}

	modifier expired(uint _id) {
		require (envelopes[_id].endTime <= now);
		_;
	}

	modifier notCreator(uint _id) {
		require (envelopes[_id].creatorAddress != msg.sender);
		_;
	}

	modifier requireSenderNotClaimed(uint _id) {
		require (envelopes[_id].claims[msg.sender] == 0);
		_;
	}

	modifier requireIdMatch(uint _id) {
		require (_id <= envelopeIndex);
		_;
	}

	modifier requireHashMatch(uint _id, string _random) {
		require (envelopes[_id].hash == keccak256(_id, creators[_random], _random));
		_;
	}

	modifier requireMinSinceLastClaim(uint _id) {
		if (envelopes[_id].lastClaimTime > 0) {
			require (now - envelopes[_id].lastClaimTime >= min_since_last_claim * 60);
		}
		_;
	}

	modifier isActive(uint _id) {
		require (envelopes[_id].remainingBalance > 0);
		_;
	}

	modifier isRevealed(uint _id) {
		require (msg.sender == envelopes[_id].creatorAddress || envelopes[_id].endTime <= now || envelopes[_id].remainingBalance == 0);
		_;
	}

	// ------------------------------
  	// events
  	// ------------------------------
	event EnvelopeCreated(uint _id, address indexed _from);
	event EnvelopeClaimed(uint indexed _id, address indexed _from, uint _value);
	event EnvelopeExpired(address indexed _from, uint _id, uint _value);

	
	// fallback function
	function() public payable {
		revert();
	}

	// create new envelope
	function newEnvelope(string _random, string _name, uint _endTime, string _messageLink, uint _maxClaims, bool _devTip) payable public {

		require (msg.value >= min_wei);
		require (msg.value <= max_wei);
		require (now < _endTime);
		require (_maxClaims >= 1);

		envelopeIndex += 1;
		
		Envelope memory env;
		env.id = envelopeIndex;
		env.hash = keccak256(envelopeIndex, msg.sender, _random);
		env.devTipPct = 0;
		if (_devTip) {
			env.devTipPct = default_dev_tip_pct;
		}
		env.creatorAddress = msg.sender;
		env.creatorName = _name;
		env.startTime = now;
		env.endTime = _endTime;
		env.initialBalance = msg.value;
		env.remainingBalance = msg.value;
		env.messageLink = _messageLink;
		env.maxClaims = _maxClaims;
		env.totalClaims = 0;
		env.lastClaimTime = 0;
		env.reveal = false;

		envelopes[envelopeIndex] = env;
		creators[_random] = msg.sender;

		EnvelopeCreated(envelopeIndex, msg.sender);
	}
	
	// claim envelope 
	function claimEnvelope(uint _id, string _random) public 
	requireHashMatch(_id, _random)
	notExpired(_id)
	isActive(_id)
	notCreator(_id)	
	requireSenderNotClaimed(_id)
	requireMinSinceLastClaim(_id)
	{		
		uint claimAmount = envelopes[_id].remainingBalance;
		if (envelopes[_id].maxClaims - envelopes[_id].totalClaims > 1) {
			claimAmount = generateClaimAmount(envelopes[_id].remainingBalance, envelopes[_id].maxClaims);
		} 

		distributeFunds(claimAmount, envelopes[_id].devTipPct, msg.sender);

		EnvelopeClaimed(_id, msg.sender, claimAmount);

		envelopes[_id].totalClaims += 1;
		envelopes[_id].claims[msg.sender] = claimAmount;
		envelopes[_id].lastClaimTime = now;
		envelopes[_id].remainingBalance -= claimAmount;				
	}

	// expire envelope
	function expireEnvelope(uint _id) public 
	isActive(_id)
	expired(_id)
	{
		distributeFunds(envelopes[_id].remainingBalance, 0, envelopes[_id].creatorAddress);
		EnvelopeExpired(envelopes[_id].creatorAddress, _id, envelopes[_id].remainingBalance);
		envelopes[_id].remainingBalance = 0;
	}

	// send funds
	function distributeFunds(uint _amount, uint _devPct, address _address) private {
		if (_devPct > 0 ){
	      uint devAmount = (_amount * _devPct / 100);
	      devAddress.transfer(devAmount);
	    }
	    uint amount = (_amount * (100 - _devPct) / 100);
	    _address.transfer(amount);
	}

	// getters
	function getEnvelopeInfo(uint _id) public view 
	requireIdMatch(_id)
	returns (string, uint, uint, uint, bool) {
		bool remaining = (envelopes[_id].remainingBalance > 0);
		return (envelopes[_id].creatorName, envelopes[_id].startTime, envelopes[_id].endTime, envelopes[_id].totalClaims, remaining);
	}

	function getEnvelopeDetails(uint _id, string _random) public view 
	requireHashMatch(_id, _random)
	returns (string, string, uint, uint, uint) {	
		uint nextClaimTime = envelopes[_id].lastClaimTime + min_since_last_claim * 60;
		return (envelopes[_id].creatorName, envelopes[_id].messageLink, envelopes[_id].endTime, envelopes[_id].totalClaims, nextClaimTime);			
	}

	function getEnvelopeReveal(uint _id, string _random) public view 
	requireHashMatch(_id, _random)
	isRevealed(_id)
	returns (address, uint, uint, uint) {
		return (envelopes[_id].creatorAddress, envelopes[_id].initialBalance, envelopes[_id].remainingBalance, envelopes[_id].maxClaims);
	}

	function getClaimInfo(uint _id, address _claimer) public view 
	requireIdMatch(_id)
	returns (uint) {
		return envelopes[_id].claims[_claimer];
	}

	// helper
	function generateClaimAmount(uint _remainingBalance, uint _maxClaims) private constant returns (uint) {		
		uint amount = uint(keccak256(block.timestamp))%(_remainingBalance-min_wei/_maxClaims*2)+min_wei/_maxClaims*2;
		require (amount > 0);
		require (amount <= _remainingBalance);
		return amount;
	}

}
