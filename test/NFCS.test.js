const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { VERSION, VERSION_V2 } = require("./constants");

let nfcs;
let accounts;

const getBundleWithSignatures = async (accounts, messageHash) => {
  const bundle = [];
  const signatures = [];
  for (let i = 0; i < 2; i++) {
    bundle.push(accounts[i].address);
    if (messageHash) {
      const signature = await accounts[i].signMessage(ethers.utils.arrayify(messageHash));
      signatures.push(signature);
    }
  }
  return { bundle, signatures };
};

const getMessageHash = () => {
  const hashValues = ["TEST", 1];
  const messageHash = ethers.utils.solidityKeccak256(
    ["string", "uint256"],
    hashValues
  );
  return { hashValues, messageHash };
};

describe("NFCS", () => {
  before(async () => {
    const NFCS = await ethers.getContractFactory("NFCS");
    const AddressBook = await ethers.getContractFactory("AddressBook");
    const addressBook = await AddressBook.deploy();

    nfcs = await upgrades.deployProxy(NFCS, [addressBook.address], {
      initializer: "initialize",
      kind: "uups",
    });
    accounts = await ethers.getSigners();
  });

  it("Retrieves the name", async () => {
    expect(await nfcs.name()).to.equal("NFCS");
  });

  it("Retrieves the version", async () => {
    expect(await nfcs.currentVersion()).to.equal(VERSION);
  });

  it("Pauses the contract", async () => {
    // Pause the contract with Owner's (account[0]) authority
    await nfcs.pause();
    // Check that contract is paused
    expect(await nfcs.paused()).to.equal(true);
  });

  it("Upgrades the contract", async () => {
    // Deploy new contract and set it in Proxy
    const NFCSV2 = await ethers.getContractFactory("NFCSV2");
    nfcs = await upgrades.upgradeProxy(
      nfcs.address,
      NFCSV2
    );
    expect(await nfcs.currentVersion()).to.equal(VERSION_V2);
  });

  it("Unpauses the contract", async () => {
    // Pause the contract with Owner's authority
    await nfcs.unpause();
    // Check that contract is paused
    expect(await nfcs.paused()).to.equal(false);
  });

  it("Mints a token", async () => {
    const { hashValues, messageHash } = getMessageHash();
    const { bundle, signatures } = await getBundleWithSignatures(accounts, messageHash);
    await nfcs.mintToken(bundle, signatures, ...hashValues, VERSION_V2);
    expect(await nfcs.ownerOf(0)).to.equal(bundle[0]);
    expect(await nfcs.balanceOf(bundle[0])).to.equal(1);
    expect(await nfcs.balanceOf(bundle[1])).to.equal(0);
  });

  it("Retrieves the token for address having NFCS token", async () => {
    expect(await nfcs.getToken(accounts[0].address)).to.equal(0);
  });

  it("Rejects getting the token for address without token", async () => {
    await expect(nfcs.getToken(accounts[10].address)).to.be.revertedWith("NFCS: no token owned.");
  });

  it("Reverts when minting with a wrong signature", async () => {
    let bundle = [];
    let signatures = [];
    const { hashValues, messageHash } = getMessageHash();
    for (let i = 2; i < 4; i++) {
      bundle.push(accounts[i].address);
      const sig = await accounts[7].signMessage(ethers.utils.arrayify(messageHash));
      signatures.push(sig);
    }
    await expect(
      nfcs
        .connect(accounts[2])
        .mintToken(bundle, signatures, ...hashValues, VERSION_V2)
    ).to.be.revertedWith("Wallet verification failed.");
    expect(await nfcs.balanceOf(accounts[2].address)).to.equal(0);
    expect(await nfcs.balanceOf(accounts[7].address)).to.equal(0);
  });

  it("Reverts when minting a duplicate address", async () => {
    const { hashValues, messageHash } = getMessageHash();
    const { bundle, signatures } = await getBundleWithSignatures(accounts, messageHash);
    await expect(
      nfcs
        .connect(accounts[1])
        .mintToken(bundle, signatures, ...hashValues, VERSION_V2)
    ).to.be.revertedWith("Address already bundled.");
    expect(await nfcs.balanceOf(accounts[1].address)).to.equal(0);
  });

  it("Retrieves the bundle for tokenId 0", async () => {
    const { bundle } = await getBundleWithSignatures(accounts);
    expect(await nfcs.connect(accounts[0]).getBundle(0)).to.deep.equal(bundle);
  });

  it("Reverts getting the bundle for non-existent tokenId", async () => {
    await expect(nfcs.connect(accounts[0]).getBundle(100)).to.be.revertedWith("NFCS: cannot get bundle of nonexistent token");
  });
});
