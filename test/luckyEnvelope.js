require('babel-polyfill');
var LuckyEnvelope = artifacts.require("./LuckyEnvelope.sol");

// util
var BigNumber = require("bignumber.js");
var rs = require("randomstring");

contract ('LuckyEnvelope', (accounts) => {

  // setup
  const gasPrice = new BigNumber(10000000000);
  const rString = rs.generate();
  const creator = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];
  const dev = accounts[4];
  var env = {
    name: 'creator',
    endTime: 0,
    msgLink: '',
    maxClaims: 1,
    devTip: false,
    amount: new BigNumber(1000000000000000000)
  }

  describe('#NewEnvelope', () => {

    it('should create env with accurate amount and update index', async () => {
      // setup 
      var creatorStartBalance = new BigNumber(web3.eth.getBalance(creator));      
      env.endTime = Date.now() + 5 * 60 * 1000; // expires in 5 mins
      env.amount = new BigNumber(600000000000000000); // change amount
      // config
      var i = await LuckyEnvelope.new({from: dev});
      var newEnvelopeRes = await i.newEnvelope(
          rString, 
          env.name, 
          env.endTime, 
          env.msgLink, 
          env.maxClaims,
          env.devTip, 
          { from: creator, value: env.amount, gasPrice: gasPrice });
      // calc gas
      var gasUsed = newEnvelopeRes.receipt.gasUsed;
      var gasCost = gasPrice.times(gasUsed);
      // make sure index is updated
      var index = await i.envelopeIndex.call();
      var getEnvelopeRevealRes = await i.getEnvelopeReveal.call(index.toNumber(), rString);
      var initialBalance = new BigNumber(getEnvelopeRevealRes[1]).toNumber();
      assert.equal(initialBalance, env.amount, "[Err] index not updated: env initial balance != set amount");
      // make sure creator used is same amount as amount + gas
      var amountPlusGasCost = env.amount.plus(gasCost).toNumber();
      var creatorEndBalance = web3.eth.getBalance(creator);
      var creatorUsed = creatorStartBalance.minus(creatorEndBalance);
      assert.equal(creatorUsed, amountPlusGasCost, "[Err] creator used != set amount plus gas");
    });

    it('should return err when amount < min', async () => {
      // setup
      env.endTime = Date.now() / 1000 + 5 * 60; // 5 mins
      env.amount = 0; // change amount
      // config
      var i = await LuckyEnvelope.new({from: dev});
      try {
        await i.newEnvelope(
          rString, 
          env.name, 
          env.endTime, 
          env.msgLink, 
          env.maxClaims,
          env.devTip, 
          { from: creator, value: env.amount, gasPrice: gasPrice });
      } catch (err) {
        console.log(err.message);
        const revert = err.message.search('revert') >= 1;
        const invalidOpcode = err.message.search('invalid opcode') >= 0;
        const outOfGas = err.message.search('out of gas') >= 0;
        assert(invalidOpcode || outOfGas || revert,'Expected throw, got \'' + err.message + '\' instead');
        return;
      }   
      assert.fail('Expected throw not received');   
    });   
    
  }); // #NewEnvelope

  describe('#Claim', () => {
    describe('#SingleClaim', () => {
      var i;
      // create new envelope (#1)
      before(async () => {
        // setup
        var creatorStartBalance = new BigNumber(web3.eth.getBalance(creator));
        env.endTime = Date.now() / 1000 + 15 * 60; // 15 mins  
        env.amount = new BigNumber(500000000000000000); // change amount
        // config
        i = await LuckyEnvelope.new({from: dev});
        var newEnvelopeRes = await i.newEnvelope(
          rString, 
          env.name, 
          env.endTime, 
          env.msgLink, 
          env.maxClaims,
          env.devTip, 
          { from: creator, value: env.amount, gasPrice: gasPrice });
        // calc gas
        var gasUsed = newEnvelopeRes.receipt.gasUsed; 
        var gasCost = gasPrice.times(gasUsed);
        // print receipt
        // var creatorEndBalance = web3.eth.getBalance(creator);
        // var creatorUsed = new BigNumber(creatorStartBalance.minus(creatorEndBalance));
        // console.log("***************************");
        // console.log("env #1 created \n");
        // console.log("gasPrice       : " + gasPrice);
        // console.log("gasUsed        : " + gasUsed);
        // console.log("gasCost        : " + gasCost + "\n");
        // console.log("env amount     : " + env.amount);
        // console.log("amount+gasCost : " + env.amount.plus(gasCost) + "\n");
        // console.log("creator start  : " + creatorStartBalance);
        // console.log("creator end    : " + creatorEndBalance);
        // console.log("creator used   : " + creatorUsed + "\n");
        // console.log("unaccounted    : " + creatorUsed.minus(env.amount.plus(gasCost)));
      });

      it('should transfer balance to claimer address w/o dev tip', async () => {
        // setup
        var user1StartBalance = web3.eth.getBalance(user1);
        
        // print
        // var index = await i.envelopeIndex.call();
        // var envelopeInfo = await i.getEnvelopeInfo.call(index.toNumber());
        // var now = Date.now() / 1000;
        // console.log("env index   : ", index.toNumber());
        // console.log("env end time: ", envelopeInfo[2].toNumber());
        // console.log("now         : ", now);
        
        // config
        var claimEnvelopeRes = await i.claimEnvelope(1, rString, { from: user1, gasPrice: gasPrice });
        // calc gas & user balance
        var gasUsed = claimEnvelopeRes.receipt.gasUsed;
        var gasCost = gasPrice.times(gasUsed);
        // get claimed envelope info
        var getEnvelopeRevealRes = await i.getEnvelopeReveal.call(1, rString);
        var initialBalance = new BigNumber(getEnvelopeRevealRes[1]);
        var remainingBalance = getEnvelopeRevealRes[2].toNumber();
        // calc user balance 
        var user1EndBalance = new BigNumber(web3.eth.getBalance(user1));
        var claimed = user1EndBalance.minus(user1StartBalance).toNumber();
        // print receipt
        // console.log("***************************");
        // console.log("env #1 claimed \n");
        // console.log("gasPrice       : " + gasPrice);
        // console.log("gasUsed        : " + gasUsed);
        // console.log("gasCost        : " + gasCost + "\n");
        // console.log("env initial    : " + initialBalance);
        // console.log("initial-gasCost: " + initialBalance.minus(gasCost));
        // console.log("remaining      : " + remainingBalance + "\n");
        // console.log("user 1 start   : " + user1StartBalance);
        // console.log("user 1 end     : " + user1EndBalance);
        // console.log("user 1 claimed : " + claimed + "\n");
        // console.log("unaccounted    : " + initialBalance.minus(gasCost).minus(claimed));

        assert.equal(remainingBalance, 0, "remaining balance is not 0");
        assert.equal(claimed, initialBalance.minus(gasCost).toNumber(), "user 1 did not claim same amount as inital balance");
      });

    }); // #SingleClaim
  }); // #Claim

});
