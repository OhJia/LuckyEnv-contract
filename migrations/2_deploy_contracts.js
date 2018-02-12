var LuckyEnvelope = artifacts.require("./LuckyEnvelope.sol");

module.exports = function(deployer) {
  deployer.deploy(LuckyEnvelope);
};
