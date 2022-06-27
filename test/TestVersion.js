const { expect } = require("chai");
const { ethers } = require("hardhat");
const { VERSION, VERSION_V2 } = require("./constants");

let testVersion;

describe("TestVersion", () => {
  before(async () => {
    const TestVersion = await ethers.getContractFactory("TestVersion");
    testVersion = await (await TestVersion.deploy()).deployed();
  });

  it("Ping without error", async () => {
    expect(await testVersion.ping(VERSION)).to.be.equal(true);
  });

  it("Revert if wrong version is provided", async () => {
    await expect(testVersion.ping(VERSION_V2)).to.be.reverted;
  });
});
