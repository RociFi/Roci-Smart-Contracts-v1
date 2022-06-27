/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-ethers");
require("@openzeppelin/hardhat-upgrades");

require("hardhat-abi-exporter");

const fs = require("fs");
const rl = require("readline-sync");

var get = require("lodash.get");

module.exports = {
  networks: {
    hardhat: {
      chainId: 138,
      forking: {
        url: "[ETH-PROVIDER]",
        timeout: 0,
      },
    },
  },
  testsTimeout: 100000,
  solidity: {
    version: "0.8.4",
    docker: false,
    settings: {
      optimizer: {
        enabled: true,
        runs: 2000,
      },
    },
  },
};
