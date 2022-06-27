const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { testsTimeout } = require("../hardhat.config");
const { getLastBlockTimestamp, mine } = require("./lib.js");
const { BigNumber } = require("ethers");
const {
  USDC_ADDRESS,
  ROLE_TOKEN,
  ROLE_BONDS,
  ROLE_PAYMENT_CONTRACT,
  ROLE_REV_MANAGER,
  ROLE_NFCS,
  ROLE_COLLATERAL_MANAGER,
  ROLE_PRICE_FEED,
  ROLE_ORACLE,
  ROLE_ADMIN,
  ROLE_PAUSER,
} = require("../scripts/constants");

describe("Address book usage", async function () {
  this.timeout(testsTimeout);

  let AddressBookFactory, addressBook;
  let owner,
    address1,
    address2,
    address3,
    address4,
    address5,
    address6,
    address7;

  before(async () => {
    [
      owner,
      address1,
      address2,
      address3,
      address4,
      address5,
      address6,
      address7,
    ] = await ethers.getSigners();

    AddressBookFactory = await ethers.getContractFactory("AddressBook");

    addressBook = await upgrades.deployProxy(AddressBookFactory, [], {
      initializer: "initialize",
    });
  });

  it("AddressBook setting check", async () => {
    const dailySystemLimit = BigNumber.from(1600.0);
    const dailyUserLimit = BigNumber.from(1000.0);
    const globalSystemLimit = BigNumber.from(1700.0);
    const globalUserLimit = BigNumber.from(1500.0);
    const globalNFCSLimit = BigNumber.from(150.0);
    const dailyDepositLimit = BigNumber.from(1000.0);
    const globalDepositLimit = BigNumber.from(1500.0);

    const latePenalty = BigNumber.from(400);
    const scoreValidityPeriod = BigNumber.from(1000.0);
    const minScore = BigNumber.from(2);
    const maxScore = BigNumber.from(12);
    const notGenerated = BigNumber.from(1);
    const generationError = BigNumber.from(2000);
    const penaltyAPYMultiplier = BigNumber.from(4);

    const gracePeriod = BigNumber.from(20 * 60 * 60 * 24);
    const nextLimitTimestamp = (await getLastBlockTimestamp()) + 60 * 60 * 24;


    await addressBook.connect(owner).setDailyLimit(dailySystemLimit);
    await addressBook.connect(owner).setUserDailyLimit(dailyUserLimit);
    await addressBook.connect(owner).setUserGlobalLimit(globalUserLimit);
    await addressBook.connect(owner).setGlobalLimit(globalSystemLimit);

    await addressBook.connect(owner).setGlobalNFCSLimit(1, globalNFCSLimit);

    await addressBook
      .connect(owner)
      .setDefaultPoolDailyLimit(dailyDepositLimit);
    await addressBook
      .connect(owner)
      .setDefaultPoolGlobalLimit(globalDepositLimit);

    await addressBook
      .connect(owner)
      .setPoolDailyLimit(USDC_ADDRESS, dailyDepositLimit);
    await addressBook
      .connect(owner)
      .setPoolGlobalLimit(USDC_ADDRESS, globalDepositLimit);
    await addressBook.connect(owner).setLimitResetTimestamp(nextLimitTimestamp);

    await addressBook.connect(owner).setLatePenalty(latePenalty);
    await addressBook
      .connect(owner)
      .setScoreValidityPeriod(scoreValidityPeriod);
    await addressBook.connect(owner).setMinScore(minScore);
    await addressBook.connect(owner).setMaxScore(maxScore);
    await addressBook.connect(owner).setNotGenerated(notGenerated);
    await addressBook.connect(owner).setGenerationError(generationError);
    await addressBook
      .connect(owner)
      .setPenaltyAPYMultiplier(penaltyAPYMultiplier);
    await addressBook.connect(owner).setGracePeriod(gracePeriod);

    await addressBook.setAddressToRole(ROLE_TOKEN, address1.address);
    await addressBook.setAddressToRole(ROLE_BONDS, address2.address);
    await addressBook.setAddressToRole(ROLE_PAYMENT_CONTRACT, address3.address);
    await addressBook.setAddressToRole(ROLE_REV_MANAGER, address4.address);
    await addressBook.setAddressToRole(ROLE_NFCS, address5.address);
    await addressBook.setAddressToRole(
      ROLE_COLLATERAL_MANAGER,
      address6.address
    );
    await addressBook.setAddressToRole(ROLE_PRICE_FEED, address7.address);
    await addressBook.setAddressToRole(ROLE_ORACLE, address1.address);
    await addressBook.setAddressToRole(ROLE_ADMIN, owner.address);
    await addressBook.setAddressToRole(ROLE_PAUSER, address2.address);

    expect(await addressBook.connect(owner).dailyLimit()).equal(
      dailySystemLimit
    );

    expect(await addressBook.connect(owner).userDailyLimit()).equal(
      dailyUserLimit
    );

    expect(await addressBook.connect(owner).userGlobalLimit()).equal(
      globalUserLimit
    );

    expect(await addressBook.connect(owner).globalLimit()).equal(
      globalSystemLimit
    );

    expect(await addressBook.connect(owner).globalNFCSLimit(1)).equal(
      globalNFCSLimit
    );

    expect(await addressBook.connect(owner).latePenalty()).equal(latePenalty);
    expect(await addressBook.connect(owner).scoreValidityPeriod()).equal(
      scoreValidityPeriod
    );
    expect(await addressBook.connect(owner).minScore()).equal(minScore);
    expect(await addressBook.connect(owner).maxScore()).equal(maxScore);
    expect(await addressBook.connect(owner).notGenerated()).equal(notGenerated);
    expect(await addressBook.connect(owner).generationError()).equal(
      generationError
    );
    expect(await addressBook.connect(owner).penaltyAPYMultiplier()).equal(
      penaltyAPYMultiplier
    );
    expect(await addressBook.connect(owner).gracePeriod()).equal(gracePeriod);

    expect(await addressBook.connect(owner).defaultPoolDailyLimit()).equal(
      dailyDepositLimit
    );

    expect(await addressBook.connect(owner).defaultPoolGlobalLimit()).equal(
      globalDepositLimit
    );

    expect(await addressBook.connect(owner).poolDailyLimit(USDC_ADDRESS)).equal(
      dailyDepositLimit
    );

    expect(
      await addressBook.connect(owner).poolGlobalLimit(USDC_ADDRESS)
    ).equal(globalDepositLimit);

    expect(await addressBook.connect(owner).limitResetTimestamp()).equal(
      nextLimitTimestamp
    );

    await mine(60 * 60 * 24);

    await addressBook.connect(owner).updateLimitResetTimestamp();

    expect(await addressBook.connect(owner).limitResetTimestamp()).equal(
      nextLimitTimestamp + 60 * 60 * 24
    );

    expect(await addressBook.addressList(ROLE_TOKEN)).equal(address1.address);
    expect(await addressBook.addressList(ROLE_BONDS)).equal(address2.address);
    expect(await addressBook.addressList(ROLE_PAYMENT_CONTRACT)).equal(
      address3.address
    );
    expect(await addressBook.addressList(ROLE_REV_MANAGER)).equal(
      address4.address
    );
    expect(await addressBook.addressList(ROLE_NFCS)).equal(address5.address);
    expect(await addressBook.addressList(ROLE_COLLATERAL_MANAGER)).equal(
      address6.address
    );
    expect(await addressBook.addressList(ROLE_PRICE_FEED)).equal(
      address7.address
    );
    expect(await addressBook.addressList(ROLE_ORACLE)).equal(address1.address);
    expect(await addressBook.addressList(ROLE_ADMIN)).equal(owner.address);
    expect(await addressBook.addressList(ROLE_PAUSER)).equal(address2.address);
  });
});
