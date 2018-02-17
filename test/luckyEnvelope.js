require('babel-polyfill');
var LuckyEnvelope = artifacts.require("./LuckyEnvelope.sol");

// util
var BigNumber = require("bignumber.js");
var rs = require("randomstring");

contract ('LuckyEnvelope', (accounts) => {

  // setup
  const gasPrice = new BigNumber(10000000000);
  const startBal = new BigNumber(100000000000000000000);
  const password = rs.generate();
  const dev = accounts[0];
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

  // ------------------------------
  // single
  // ------------------------------
  describe('#Single', () => {
    var i;
    var gasUsedNewEnvelope;
    var gasUsedWithdraw;
    // create new envelope (#1)
    before(async () => {
      // setup 
      creator.startBalance = new BigNumber(web3.eth.getBalance(creator.address)); 
      temp.startBalance = new BigNumber(web3.eth.getBalance(temp.address));      
      env.endTime = Date.now() + 15 * 60 * 1000; // expires in 15 mins
      env.amount = new BigNumber(600000000000000000); // change amount
      env.feeAmount = new BigNumber(1606730000000000); // single claim fee: 1606730 gwei
      // config 
      i = await LuckyEnvelope.new({ from: dev });
      var newEnvelopeRes = await i.newEnvelope(
          env.passEnable, 
          env.password,
          temp.address,
          env.name, 
          env.endTime, 
          env.msgLink, 
          env.maxClaims,
          env.feeAmount,
          env.devTip, 
          { from: creator.address, value: env.amount.plus(env.feeAmount), gasPrice: gasPrice });
      console.log(newEnvelopeRes.logs[0].event);
      gasUsedNewEnvelope = new BigNumber(newEnvelopeRes.receipt.gasUsed);
      // exec withdraw
      var withdrawRes = await i.withdrawPending(1, temp.address, { from: creator.address, gasPrice: gasPrice });
      console.log(withdrawRes.logs[0].event);
      temp.endBalance = new BigNumber(web3.eth.getBalance(temp.address));
      gasUsedWithdraw = withdrawRes.receipt.gasUsed;
      creator.endBalance = web3.eth.getBalance(creator.address);
    });

    describe('#Create-noTip', () => {
      it('should deposit accurate amount from creatorAddr and transfer fee to tempAddr', async () => {      
        // make sure index is updated
        var index = await i.envelopeIndex.call();
        var getEnvelopeRevealRes = await i.getEnvelopeReveal.call(index.toNumber());
        var initialBalance = new BigNumber(getEnvelopeRevealRes[1]).toNumber();
        assert.equal(initialBalance, env.amount, "[Err] index not updated: env initial balance != set amount");
        // calc gas cost
        var totalGas = gasUsedNewEnvelope.plus(gasUsedWithdraw);
        var gasCost = gasPrice.times(totalGas);
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
        // setup
        user1.startBalance = web3.eth.getBalance(user1.address);
        temp.startBalance = new BigNumber(web3.eth.getBalance(temp.address)); 
        // config
        var index = await i.envelopeIndex.call();
        var checkClaimRes = await i.checkClaim(index, temp.address, user1.address, env.password, 
          { from: temp.address, gasPrice: gasPrice })
        temp.endBalance = new BigNumber(web3.eth.getBalance(temp.address));
        var tempUsedBalance = temp.startBalance.minus(temp.endBalance);
        console.log("***************************");
        console.log("check claim \n");
        console.log("temp start     : " + temp.startBalance);
        console.log("temp end       : " + temp.endBalance);
        console.log("temp used      : " + tempUsedBalance + "\n");
        var tempStart = new BigNumber(web3.eth.getBalance(temp.address)); 
        var withdrawRes = await i.withdrawPending(index, user1.address, { from: temp.address, gasPrice: gasPrice }); 
        // calc gas & user balance
        var gasUsedCheckClaim = new BigNumber(checkClaimRes.receipt.gasUsed);
        var totalGas = gasUsedCheckClaim.plus(withdrawRes.receipt.gasUsed)
        var gasCost = gasPrice.times(totalGas);
        // get claimed envelope info
        var getEnvelopeRevealRes = await i.getEnvelopeReveal.call(index);
        var initialBalance = new BigNumber(getEnvelopeRevealRes[1]);
        var remainingBalance = getEnvelopeRevealRes[2].toNumber();
        // calc user balance 
        user1.endBalance = new BigNumber(web3.eth.getBalance(user1.address));
        var claimed = user1.endBalance.minus(user1.startBalance).toNumber();
        // calc tempAddr
        temp.endBalance = new BigNumber(web3.eth.getBalance(temp.address));
        var tempUsedBalance2 = temp.startBalance.minus(temp.endBalance);
        assert.equal(remainingBalance, 0, "remaining balance is not 0");
        assert.equal(claimed, initialBalance.toNumber(), "user 1 did not claim same amount as initial balance");
        assert.equal(tempUsedBalance2, gasCost.toNumber(), "amt used from tempAddr != total gas cost");
        
        var tempUsed = tempStart.minus(temp.endBalance);
        console.log("***************************");
        console.log("withdrew \n");
        console.log("temp start     : " + tempStart);
        console.log("temp end       : " + temp.endBalance);
        console.log("temp used      : " + tempUsed + "\n");
        console.log("***************************");
        console.log("temp total used: " + tempUsed.plus(tempUsedBalance) + "\n");
      })
    }); // #Claim
  }); // #Single

});
