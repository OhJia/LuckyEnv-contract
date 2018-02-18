require('babel-polyfill');
var LuckyEnvelope = artifacts.require("./LuckyEnvelope.sol");

// util
var BigNumber = require("bignumber.js");
var rs = require("randomstring");

contract ('LuckyEnvelope', (accounts) => {

  // setup
  const GAS_PRICE = new BigNumber(1000000000);
  const CLAIM_GAS_SINGLE = new BigNumber(160673);
  const CLAIM_GAS_DOUBLE = new BigNumber(290850);
  //const CLAIM_GAS_MULTI = new BigNumber((32000 + 120022 * maxClaims) * 1.05);
  const PASSWORD = rs.generate();  
  const DEV = accounts[0];
  const user2 = accounts[4];
  const user3 = accounts[5];
  var env = {
    passEnable: false,
    password: '',
    name: 'creator',
    endTime: 0,
    msgLink: '',
    maxClaims: 1,
    feeAmount: 0,
    devTip: false,
    amount: new BigNumber(1000000000000000000) // 1 eth
  }
  var creator = { address: accounts[1], startBalance: 0, endBalance: 0 };
  var temp = { address: accounts[2], startBalance: 0, endBalance: 0 };
  var user1 = { address: accounts[3], startBalance: 0, endBalance: 0 };

  var i;
  before(async () => {
    i = await LuckyEnvelope.new({ from: DEV });
  });
  // ------------------------------
  // single
  // ------------------------------
  describe('#Single', () => {
    describe('#Create-noTip', () => {
      it('should deposit accurate amount from creatorAddr and transfer fee to tempAddr', async () => {      
        // get start balances
        creator.startBalance = new BigNumber(web3.eth.getBalance(creator.address)); 
        temp.startBalance = new BigNumber(web3.eth.getBalance(temp.address)); 

        // config       
        env.endTime = Date.now() + 15 * 60 * 1000; // expires in 15 mins
        env.feeAmount = CLAIM_GAS_SINGLE.times(GAS_PRICE); // single claim fee: 1606730 gwei
        // i = await LuckyEnvelope.new({ from: dev });
        // create new
        var newEnvelopeRes = await i.newEnvelope(env.passEnable, env.password, temp.address,
            env.name, env.endTime, env.msgLink, env.maxClaims, env.feeAmount, env.devTip, 
            { from: creator.address, value: env.amount.plus(env.feeAmount), gasPrice: GAS_PRICE });
        console.log(newEnvelopeRes.logs[0].event);
        
        // calc gas cost
        var gasUsedNewEnvelope = new BigNumber(newEnvelopeRes.receipt.gasUsed);
        var gasCost = GAS_PRICE.times(gasUsedNewEnvelope);
        console.log(`newEnvelope gas used: ${gasUsedNewEnvelope}`);
        // calc end balances
        temp.endBalance = new BigNumber(web3.eth.getBalance(temp.address));
        creator.endBalance = web3.eth.getBalance(creator.address);
        
        // make sure index is updated
        var index = await i.envelopeIndex.call();
        var getEnvelopeRevealRes = await i.getEnvelopeReveal.call(index.toNumber());
        var initialBalance = new BigNumber(getEnvelopeRevealRes[1]).toNumber();
        assert.equal(initialBalance, env.amount, "[Err] index not updated: env initial balance != set amount");
        
        // make sure creator used is same amount as amount + gas
        var amountPlusFeePlusGasCost = env.amount.plus(env.feeAmount).plus(gasCost).toNumber();
        var creatorUsed = creator.startBalance.minus(creator.endBalance);
        assert.equal(creatorUsed.toNumber(), amountPlusFeePlusGasCost, "[Err] creator used != set amount plus gas and fee");
        
        // make sure feeAmount is transferred to tempAddr
        var tempDeposited = temp.endBalance.minus(temp.startBalance);
        console.log(`temp deposited: ${tempDeposited}`)
        assert.equal(tempDeposited.toNumber(), env.feeAmount.toNumber(), "[Err] temp deposited != fee amount");
      });
    }); // #Create

    describe('#Claim-noTip', () => {
      it('should transfer amount to claimerAddr and tempAddr pay transaction fees', async () => {
        // get start balances
        user1.startBalance = web3.eth.getBalance(user1.address);
        temp.startBalance = new BigNumber(web3.eth.getBalance(temp.address)); 
        
        // check claim
        var index = await i.envelopeIndex.call();
        var checkClaimRes = await i.checkClaim(index, temp.address, user1.address, env.password, 
          { from: temp.address, gasPrice: GAS_PRICE })
        // calc tempAddr used: check claim 
        temp.endBalance = new BigNumber(web3.eth.getBalance(temp.address));
        var tempCheckClaimUsed = temp.startBalance.minus(temp.endBalance);
        console.log("***************************");
        console.log("check claim \n");
        console.log("temp start     : " + temp.startBalance);
        console.log("temp end       : " + temp.endBalance);
        console.log("temp used      : " + tempCheckClaimUsed + "\n");

        // withdraw
        var tempWithdrawStart = temp.endBalance; 
        var withdrawRes = await i.withdrawPending(index, user1.address, { from: temp.address, gasPrice: GAS_PRICE }); 
        // calc tempAddr used: withdraw 
        temp.endBalance = new BigNumber(web3.eth.getBalance(temp.address));
        var tempWithdrawUsed = tempWithdrawStart.minus(temp.endBalance);
        var tempTotalUsed = temp.startBalance.minus(temp.endBalance);
        console.log("***************************");
        console.log("withdrew \n");
        console.log("temp start     : " + tempWithdrawStart);
        console.log("temp end       : " + temp.endBalance);
        console.log("temp used      : " + tempWithdrawUsed + "\n");
        console.log("***************************");
        console.log("temp total used: " + tempTotalUsed + "\n");
        
        // calc gas & user balance
        var gasUsedCheckClaim = new BigNumber(checkClaimRes.receipt.gasUsed);
        var totalGas = gasUsedCheckClaim.plus(withdrawRes.receipt.gasUsed)
        var gasCost = GAS_PRICE.times(totalGas);
        // get claimed envelope info
        var getEnvelopeRevealRes = await i.getEnvelopeReveal.call(index);
        var initialBalance = new BigNumber(getEnvelopeRevealRes[1]);
        var remainingBalance = getEnvelopeRevealRes[2].toNumber();
        // calc user balance 
        user1.endBalance = new BigNumber(web3.eth.getBalance(user1.address));
        var claimed = user1.endBalance.minus(user1.startBalance).toNumber();
        // calc tempAddr
        
        assert.equal(remainingBalance, 0, "remaining balance is not 0");
        assert.equal(claimed, initialBalance.toNumber(), "user 1 did not claim same amount as initial balance");
        assert.equal(tempTotalUsed, gasCost.toNumber(), "amt used from tempAddr != total gas cost");
        
      })
    }); // #Claim
  }); // #Single

  // ------------------------------
  // double
  // ------------------------------
  describe('#Double', () => {
    describe('#Create-noTip', () => {
      it('should deposit accurate amount from creatorAddr and transfer fee to tempAddr', async () => {      
        // get start balances
        creator.startBalance = new BigNumber(web3.eth.getBalance(creator.address)); 
        temp.startBalance = new BigNumber(web3.eth.getBalance(temp.address)); 

        // config       
        env.endTime = Date.now() + 15 * 60 * 1000; // expires in 15 mins
        env.maxClaims = 2; // update to double
        env.feeAmount = CLAIM_GAS_DOUBLE.times(GAS_PRICE); // single claim fee: 1606730 gwei
        // create new
        var newEnvelopeRes = await i.newEnvelope(env.passEnable, env.password, temp.address,
            env.name, env.endTime, env.msgLink, env.maxClaims, env.feeAmount, env.devTip, 
            { from: creator.address, value: env.amount.plus(env.feeAmount), gasPrice: GAS_PRICE });
        console.log(newEnvelopeRes.logs[0].event);
        
        // calc gas cost
        var gasUsedNewEnvelope = new BigNumber(newEnvelopeRes.receipt.gasUsed);
        var gasCost = GAS_PRICE.times(gasUsedNewEnvelope);
        console.log(`newEnvelope gas used: ${gasUsedNewEnvelope}`);
        // calc end balances
        temp.endBalance = new BigNumber(web3.eth.getBalance(temp.address));
        creator.endBalance = web3.eth.getBalance(creator.address);
        
        // make sure index is updated
        var index = await i.envelopeIndex.call();
        var getEnvelopeRevealRes = await i.getEnvelopeReveal.call(index.toNumber());
        var initialBalance = new BigNumber(getEnvelopeRevealRes[1]).toNumber();
        assert.equal(initialBalance, env.amount, "[Err] index not updated: env initial balance != set amount");
        
        // make sure creator used is same amount as amount + gas
        var amountPlusFeePlusGasCost = env.amount.plus(env.feeAmount).plus(gasCost).toNumber();
        var creatorUsed = creator.startBalance.minus(creator.endBalance);
        assert.equal(creatorUsed.toNumber(), amountPlusFeePlusGasCost, "[Err] creator used != set amount plus gas and fee");
        
        // make sure feeAmount is transferred to tempAddr
        var tempDeposited = temp.endBalance.minus(temp.startBalance);
        console.log(`temp deposited: ${tempDeposited}`)
        assert.equal(tempDeposited.toNumber(), env.feeAmount.toNumber(), "[Err] temp deposited != fee amount");
      });
    }); // #Create

  }); // #Double

});
