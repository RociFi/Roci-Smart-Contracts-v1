const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { testsTimeout } = require("../hardhat.config.js");

const MAX_UINT = BigNumber.from(2).pow(256).sub(1);

const {
  borrow,
  getLastLoanId,
  sleep,
  toWei,
  fromWeiNumber,
  configureForTests,
  localDeployV3,
  mint,
  updateScore,
  configureAfterDeploy,
  setTokenBalanceFor,

  getDepositAmount,
  getWithdrawalAmount,
  deposit,
  toTokenWei,
  quickdeposit,
} = require("./lib.js");
const {
  errors,
  VERSION,
  ROCI_PAYMENT_VERSION,
  ROLE_TOKEN,
} = require("./constants.js");

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("PoolInvestor.constructor()", () => {
  let cs;
  let user1;

  beforeEach(async function () {
    this.timeout(testsTimeout);
    [, user1] = await ethers.getSigners();

    cs = await localDeployV3();
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 5, user1);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Should deploy and set AddressBook, symbol, name", async () => {
    expect(await cs.Investor.addressBook()).equal(cs.AddressBook.address);
    expect(await cs.Investor.name()).equal("Roci Debt Token");
    expect(await cs.Investor.symbol()).equal("rUSDC1");
  });

  it("Check pausable of poolinvestor", async () => {
    // Pause the contract with Owner's (account[0]) authority
    await cs.Investor.connect(user1).pause();
    // Check that contract is paused
    expect(await cs.Investor.paused()).to.equal(true);

    const NFCSID = 1;
    const borrowAmount = await toTokenWei("1", cs.TestUSDC);
    const collateralAmount = await toTokenWei("0.5", cs.TestETH);

    const hash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256"],
        [user1.address, NFCSID]
      )
    );

    let signature = await user1.signMessage(ethers.utils.arrayify(hash));

    await expect(
      cs.Investor.connect(user1).borrow(
        {
          _amount: borrowAmount,
          // _duration: borrowPeriod,
          _NFCSID: NFCSID,
          _collateralAmount: collateralAmount,
          _collateral: user1.address,
          _hash: hash,
          _signature: signature,
        },
        VERSION
      )
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      cs.Investor.connect(user1).collect([NFCSID], VERSION)
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      cs.Investor.connect(user1).depositPool(borrowAmount, VERSION)
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      cs.Investor.connect(user1).withdrawalPool(borrowAmount, VERSION)
    ).to.be.revertedWith("Pausable: paused");

    // UnPause the contract with Owner's authority
    await cs.Investor.connect(user1).unpause();
    // Check that contract is not paused
    expect(await cs.Investor.paused()).to.equal(false);
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("PoolInvestor.setInterestRateAnnual()", () => {
  let cs;
  let user1;

  beforeEach(async function () {
    this.timeout(testsTimeout);

    [, user1] = await ethers.getSigners();

    cs = await localDeployV3();
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 3, user1);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Should revert with message: Interest rate have to be positive", async () => {
    await expect(
      cs.Investor.setInterestRateAnnual(toWei(0.0))
    ).to.be.revertedWith(errors.POOL_INVESTOR_INTEREST_RATE);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Interest rate should be changed after setInterestRateAnnual call", async () => {
    await cs.Investor.setInterestRateAnnual(toWei(3.0));
    expect(await cs.Investor.interestRateAnnual()).to.equal(toWei(3.0));
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("PoolInvestor.updateAddresses()", () => {
  let cs;
  let user1;

  beforeEach(async function () {
    this.timeout(testsTimeout);

    [, user1] = await ethers.getSigners();

    cs = await localDeployV3();

    const PiDisclosurerFactory = await ethers.getContractFactory(
      "PoolInvestorDisclosurer"
    );

    cs.InvestorRuSDC1 = await PiDisclosurerFactory.deploy(
      cs.AddressBook.address,
      cs.TestUSDC.address,
      0x72,
      0x31
    );
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 5, user1);
  });
  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Check pauseble of Managers", async () => {
    // Pause the contract with Owner's (account[0]) authority
    await cs.RevenueManager.connect(user1).pause();
    // Check that contract is paused
    expect(await cs.RevenueManager.paused()).to.equal(true);

    const borrowAmount = await toTokenWei("1", cs.TestUSDC);

    await expect(
      cs.RevenueManager.deposit(user1.address, user1.address, borrowAmount)
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      cs.RevenueManager.withdrawal(user1.address, borrowAmount, user1.address)
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      cs.RevenueManager.payment(user1.address, borrowAmount)
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      cs.RevenueManager.requestFunds(user1.address, borrowAmount)
    ).to.be.revertedWith("Pausable: paused");
    // UnPause the contract with Owner's authority
    await cs.RevenueManager.connect(user1).unpause();
    // Check that contract is not paused
    expect(await cs.RevenueManager.paused()).to.equal(false);
  });

  it("Check pauseble of RociPayment", async () => {
    // Pause the contract with Owner's (account[0]) authority
    await cs.RociPayment.connect(user1).pause();
    // Check that contract is paused
    expect(await cs.RociPayment.paused()).to.equal(true);

    const borrowAmount = await toTokenWei("1", cs.TestUSDC);

    await expect(cs.RociPayment.issueBonds(1)).to.be.revertedWith(
      "Pausable: paused"
    );

    await expect(
      cs.RociPayment.addInterest(borrowAmount, 1)
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      cs.RociPayment.configureNew(
        user1.address,
        user1.address,
        1,
        1,
        1,
        1,
        1,
        1
      )
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      cs.RociPayment.withdrawl(1, borrowAmount, user1.address)
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      cs.RociPayment.payment(1, borrowAmount, ROCI_PAYMENT_VERSION)
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      cs.RociPayment.addCollateral(user1.address, user1.address, 1)
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      cs.RociPayment.claimCollateral(
        cs.TestETH.address,
        borrowAmount,
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith("Pausable: paused");

    // UnPause the contract with Owner's authority
    await cs.RociPayment.connect(user1).unpause();
    // Check that contract is not paused
    expect(await cs.RociPayment.paused()).to.equal(false);
  });
  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Should configure addresses and set allowance", async () => {
    /*
    Works for new deploy only.
    */

    await cs.AddressBook.setAddressToRole(ROLE_TOKEN, cs.TestUSDC.address);

    await cs.Investor.updateApprovals();

    expect(
      await cs.TestUSDC.allowance(
        cs.Investor.address,
        cs.RevenueManager.address
      )
    ).equal(MAX_UINT);

    expect(
      await cs.Bonds.isApprovedForAll(
        cs.Investor.address,
        cs.RociPayment.address
      )
    ).equal(true);
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("PoolInvestor.setReserveRate()", () => {
  let cs;
  let user1;

  beforeEach(async function () {
    this.timeout(testsTimeout);

    [, user1] = await ethers.getSigners();

    cs = await localDeployV3();

    const PiDisclosurerFactory = await ethers.getContractFactory(
      "PoolInvestorDisclosurer"
    );

    cs.InvestorRuSDC1 = await PiDisclosurerFactory.deploy(
      cs.AddressBook.address,
      cs.TestUSDC.address,
      0x72,
      0x31
    );
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 5, user1);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Reserve rate should be equal to constant from Globals.sol", async () => {
    expect(await cs.Investor.reserveRate()).to.equal(
      await cs.Investor.oneHundredPercents()
    );
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Reserve rate should be changed after setReserveRate call", async () => {
    const newReserveRate = toWei(50.0);

    await cs.Investor.setReserveRate(newReserveRate);

    expect(await cs.Investor.reserveRate()).to.equal(newReserveRate);
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("PoolInvestor.depositPool()", () => {
  let cs;
  let user1, user2;

  const tokenAmount = "10";
  let tokenAmountWei;

  beforeEach(async function () {
    this.timeout(testsTimeout);

    [, user1, user2] = await ethers.getSigners();

    cs = await localDeployV3();

    const PiDisclosurerFactory = await ethers.getContractFactory(
      "PoolInvestorDisclosurer"
    );

    cs.InvestorRuSDC1 = await PiDisclosurerFactory.deploy(
      cs.AddressBook.address,
      cs.TestUSDC.address,
      0x72,
      0x31
    );
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 5, user1);

    tokenAmountWei = await toTokenWei(tokenAmount, cs.TestUSDC);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Should set stakeTimes[user.address], send asset to RevManager and mint tokens to user", async () => {
    const revenueBalanceBefore = await cs.TestUSDC.balanceOf(
      cs.RevenueManager.address
    );

    await setTokenBalanceFor(cs.TestUSDC, user1, tokenAmount);

    let userBalanceBefore = await cs.TestUSDC.balanceOf(user1.address);

    expect(await cs.Investor.reserveRate()).to.equal(toWei("100"));

    await deposit({
      pool: cs.Investor,
      user: user1,
      token: cs.TestUSDC,
      amount: tokenAmount,
    });

    expect(await cs.Investor.stakeTimes(user1.address), "stakeTimes").to.equal(
      (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))
        .timestamp
    );

    expect(await cs.TestUSDC.balanceOf(user1.address), "Balance is less").equal(
      userBalanceBefore.sub(tokenAmountWei)
    );

    expect(
      await cs.Investor.balanceOf(user1.address),
      "Debt token amount"
    ).equal(tokenAmountWei);

    expect(
      await cs.TestUSDC.balanceOf(cs.RevenueManager.address),
      "RevManager got money"
    ).equal(revenueBalanceBefore.add(tokenAmountWei));
  });

  it("Double deposit", async () => {
    await cs.RevenueManager.addAcceptedDeposits([cs.Investor.address]);

    //User1 deposit
    await setTokenBalanceFor(cs.TestUSDC, user1, tokenAmount);
    await deposit({
      pool: cs.Investor,
      user: user1,
      token: cs.TestUSDC,
      amount: tokenAmount,
    });

    //User2 deposit
    await setTokenBalanceFor(cs.TestUSDC, user2, tokenAmount);

    let supply = await cs.Investor.totalSupply();
    let liq = await cs.RevenueManager.balanceAvailable(cs.Investor.address);

    expect(await cs.Investor.reserveRate()).to.equal(toWei("100"));

    await deposit({
      pool: cs.Investor,
      user: user2,
      token: cs.TestUSDC,
      amount: tokenAmount,
    });

    expect(await cs.Investor.balanceOf(user2.address)).to.equal(
      tokenAmountWei.mul(supply).div(liq)
    );
  });

  it("Pool liquidity amount", async () => {
    await cs.RevenueManager.addAcceptedDeposits([cs.Investor.address]);

    await setTokenBalanceFor(cs.TestUSDC, user1, tokenAmount);
    await deposit({
      pool: cs.Investor,
      user: user1,
      token: cs.TestUSDC,
      amount: tokenAmount,
    });

    expect(await cs.Investor.poolValue()).to.equal(tokenAmountWei);
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("PoolInvestor.withdrawalPool()", () => {
  const tokenAmount = "10";
  let cs;
  let user1;

  beforeEach(async function () {
    this.timeout(testsTimeout);
    [, user1] = await ethers.getSigners();

    cs = await localDeployV3();

    const PiDisclosurerFactory = await ethers.getContractFactory(
      "PoolInvestorDisclosurer"
    );

    cs.InvestorRuSDC1 = await PiDisclosurerFactory.deploy(
      cs.AddressBook.address,
      cs.TestUSDC.address,
      0x72,
      0x31
    );
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 5, user1);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Should exchange rTokens to TestToken, LE user balance.", async () => {
    await cs.RevenueManager.addAcceptedDeposits([cs.Investor.address]);
    await setTokenBalanceFor(cs.TestUSDC, user1, tokenAmount);
    await deposit({
      pool: cs.Investor,
      token: cs.TestUSDC,
      user: user1,
      amount: tokenAmount,
    });

    await sleep(12);

    const userBalance = await cs.Investor.balanceOf(user1.address);
    const calculatedWithdrawalValue = getWithdrawalAmount(
      userBalance,
      await cs.RevenueManager.balanceAvailable(cs.Investor.address),
      await cs.Investor.totalSupply(),
      await cs.Investor.reserveRate()
    );

    await setTokenBalanceFor(cs.TestUSDC, user1, "0");

    await cs.Investor.connect(user1).withdrawalPool(userBalance, VERSION);

    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      calculatedWithdrawalValue
    );
    expect(await cs.Investor.balanceOf(user1.address)).equal(toWei("0"));
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Should exchange rTokens to TestToken, greather than user balance.", async () => {
    await cs.RevenueManager.addAcceptedDeposits([cs.Investor.address]);

    await setTokenBalanceFor(cs.TestUSDC, user1, tokenAmount);

    await deposit({
      pool: cs.Investor,
      user: user1,
      token: cs.TestUSDC,
      amount: tokenAmount,
    });

    let debtBal = await cs.Investor.balanceOf(user1.address);
    // await sleep(12);
    let balBefore = await cs.TestUSDC.balanceOf(user1.address);
    let supply = await cs.Investor.totalSupply();
    let liq = await cs.RevenueManager.balanceAvailable(cs.Investor.address);

    await cs.Investor.connect(user1).withdrawalPool(debtBal, VERSION);

    let balAfter = await cs.TestUSDC.balanceOf(user1.address);

    expect(await cs.Investor.balanceOf(user1.address)).equal(toWei(0));

    expect(balAfter.sub(balBefore)).equal(debtBal.mul(liq).div(supply));
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("PoolInvestor._sendAllToRevManager()", () => {
  let cs;
  let user1;

  beforeEach(async function () {
    this.timeout(testsTimeout);

    [, user1] = await ethers.getSigners();

    cs = await localDeployV3();

    const PiDisclosurerFactory = await ethers.getContractFactory(
      "PoolInvestorDisclosurer"
    );

    cs.InvestorRuSDC1 = await PiDisclosurerFactory.deploy(
      cs.AddressBook.address,
      cs.TestUSDC.address,
      0x72,
      0x31
    );
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 5, user1);
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("PoolInvestor._sendFunds()", () => {
  const tokenAmount = "10";
  let tokenAmountWei;
  let cs;
  let owner, user1, user2;

  beforeEach(async function () {
    this.timeout(testsTimeout);

    [owner, user1, user2] = await ethers.getSigners();

    cs = await localDeployV3();

    const PiDisclosurerFactory = await ethers.getContractFactory(
      "PoolInvestorDisclosurer"
    );

    cs.InvestorRuSDC1 = await PiDisclosurerFactory.deploy(
      cs.AddressBook.address,
      cs.TestUSDC.address,
      0x72,
      0x31
    );
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 5, user1);

    tokenAmountWei = await toTokenWei(tokenAmount, cs.TestUSDC);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Should receive funds from RevenueManager and send it to borrower", async () => {
    await setTokenBalanceFor(cs.TestUSDC, user1, tokenAmount);
    await cs.RevenueManager.connect(owner).addAcceptedDeposits([
      cs.Investor.address,
    ]);

    await deposit({
      user: user1,
      token: cs.TestUSDC,
      pool: cs.Investor,
      amount: tokenAmount,
    });

    const beforeBalance = await cs.TestUSDC.balanceOf(user2.address);

    await cs.Investor.sendFunds(user2.address, tokenAmountWei);

    expect(await cs.TestUSDC.balanceOf(user2.address)).equal(
      beforeBalance.add(tokenAmountWei)
    );
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("PoolInvestor._checkAvailable()", () => {
  const tokenAmount = "10";
  const tokenAmountBN = BigNumber.from(tokenAmount);
  let tokenAmountWei;

  let cs;
  let owner, user1;

  beforeEach(async function () {
    this.timeout(testsTimeout);

    [owner, user1] = await ethers.getSigners();

    cs = await localDeployV3();

    const PiDisclosurerFactory = await ethers.getContractFactory(
      "PoolInvestorDisclosurer"
    );

    cs.InvestorRuSDC1 = await PiDisclosurerFactory.deploy(
      cs.AddressBook.address,
      cs.TestUSDC.address,
      0x72,
      0x31
    );
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 5, user1);

    tokenAmountWei = await toTokenWei(tokenAmount, cs.TestUSDC);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Should revert with message: There are not enough funds available to fulfill this loan", async () => {
    await expect(cs.Investor.checkAvailable(MAX_UINT)).to.be.revertedWith(
      errors.POOL_INVESTOR_NOT_ENOUGH_FUNDS
    );
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Should not revert with message: There are not enough funds available to fulfill this loan", async () => {
    await setTokenBalanceFor(cs.TestUSDC, owner, tokenAmountWei.mul(2));

    await cs.Investor.setReserveRate(tokenAmount);
    await deposit({
      token: cs.TestUSDC,
      user: owner,
      amount: tokenAmountBN.mul(2),
      pool: cs.Investor,
    });

    await expect(cs.Investor.checkAvailable(tokenAmount)).not.to.be.reverted;
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("PoolInvestor.collect()", () => {
  let cs;
  let user1, user2;

  beforeEach(async function () {
    [, user1, user2] = await ethers.getSigners();

    cs = await localDeployV3();

    const PiDisclosurerFactory = await ethers.getContractFactory(
      "PoolInvestorDisclosurer"
    );

    cs.InvestorRuSDC1 = await PiDisclosurerFactory.deploy(
      cs.AddressBook.address,
      cs.TestUSDC.address,
      0x72,
      0x31
    );
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 3, user1);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////
  it("Should collect interest and send it to RevenueManager", async () => {
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));
    const borrowAmount = "1000";
    const depositAmount = "10000";
    const collateralAmount = 0.5;
    const collateralAmountWei = await toTokenWei(collateralAmount, cs.TestETH);
    const loansQuantity = 5;
    const toPay = await toTokenWei(borrowAmount, cs.TestUSDC);
    await cs.Investor.setReserveRate(toWei(10));

    /* Deposit some funds to be borrowed */
    await setTokenBalanceFor(cs.TestUSDC, user2, depositAmount);

    await deposit({
      pool: cs.Investor,
      user: user2,
      token: cs.TestUSDC,
      amount: depositAmount,
    });

    const startInvestorBalance = await cs.TestUSDC.balanceOf(
      cs.Investor.address
    );

    await setTokenBalanceFor(
      cs.TestETH,
      user1,
      (collateralAmount * loansQuantity).toString()
    );

    cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      collateralAmountWei.mul(loansQuantity)
    );

    let loans = [];

    for (let loan = 0; loan < loansQuantity; loan++) {
      await borrow(
        cs.RociPayment,
        cs.Investor,
        user1,
        borrowAmount,
        NFCSID,
        collateralAmount,
        cs.TestETH,
        cs.TestUSDC
      );

      const loanID = await getLastLoanId(cs.RociPayment, user1.address);

      loans.push(loanID);

      await cs.TestUSDC.connect(user1).approve(cs.RociPayment.address, toPay);
      await cs.RociPayment.connect(user1).payment(
        loanID,
        toPay.sub("100"), //collect bug. TODO: first fix collect then remove this
        ROCI_PAYMENT_VERSION
      );
    }

    let revenueBalanceBefore = await cs.TestUSDC.balanceOf(
      cs.RevenueManager.address
    );

    await cs.Investor.collect(loans, VERSION);

    let revenueBalanceAfter = await cs.TestUSDC.balanceOf(
      cs.RevenueManager.address
    );

    expect(
      fromWeiNumber(
        revenueBalanceAfter.sub(revenueBalanceBefore).sub(startInvestorBalance)
      )
    ).eqls(
      fromWeiNumber(
        toPay.mul(loansQuantity).sub(BigNumber.from("100").mul(loansQuantity)) //collect bug. TODO: first fix collect then remove this
      )
    );
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe.skip("PoolInvestor.getDebtTokensToMintAmount()", () => {
  let cs;
  let user1;

  beforeEach(async function () {
    this.timeout(testsTimeout);

    [, user1] = await ethers.getSigners();

    cs = await localDeployV3();

    const PiDisclosurerFactory = await ethers.getContractFactory(
      "PoolInvestorDisclosurer"
    );

    cs.InvestorRuSDC1 = await PiDisclosurerFactory.deploy(
      cs.AddressBook.address,
      cs.TestUSDC.address,
      0x72,
      0x31
    );
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 5, user1);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Should revert with message: PoolInvestor.sol: amount should be positive", async () => {
    expect(
      cs.Investor.getDebtTokensToMintAmount(toWei("0"))
    ).to.be.revertedWith("PoolInvestor.sol: amount should be positive");
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("ToMint with zero supply, should return tokenAmount", async () => {
    const tokenAmountWei = await toTokenWei("10", cs.TestUSDC);

    expect(
      await cs.Investor.callStatic.getDebtTokensToMintAmount(tokenAmountWei)
    ).equal(tokenAmountWei);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  // TODO adapt for the new debt token formula
  it("ToMint with non-zero supply, should return calculated value", async () => {
    const checkCount = 10;
    await cs.Investor.mintForTest(user1.address, toWei("10"));

    for (let i = 1; i <= checkCount; i++) {
      const calculatedDepositAmount = getDepositAmount(
        toWei(checkCount),
        await cs.RevenueManager.balanceAvailable(cs.Investor.address),
        await cs.Investor.totalSupply(),
        await cs.Investor.reserveRate()
      );

      expect(
        await cs.Investor.getDebtTokensToMintAmount(toWei(checkCount))
      ).equal(calculatedDepositAmount);
    }
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe.skip("PoolInvestor.getWithdrawalTokenReturnAmount()", () => {
  let cs;
  let user1;

  beforeEach(async function () {
    this.timeout(testsTimeout);

    [, user1] = await ethers.getSigners();

    cs = await localDeployV3();

    const PiDisclosurerFactory = await ethers.getContractFactory(
      "PoolInvestorDisclosurer"
    );

    cs.InvestorRuSDC1 = await PiDisclosurerFactory.deploy(
      cs.AddressBook.address,
      cs.TestUSDC.address,
      0x72,
      0x31
    );
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 5, user1);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("ToMint with non-zero supply, should return calculated value", async () => {
    const checkCount = 10;

    await cs.Investor.mintForTest(cs.RevenueManager.address, toWei("10"));

    for (let i = 1; i <= checkCount; i++) {
      const calculatedDepositAmount = getWithdrawalAmount(
        toWei(checkCount),
        await cs.RevenueManager.balanceAvailable(cs.Investor.address),
        await cs.Investor.totalSupply(),
        await cs.Investor.reserveRate()
      );

      expect(
        await cs.Investor.getWithdrawalTokenReturnAmount(toWei(checkCount))
      ).equal(calculatedDepositAmount);
    }
  });
});

describe("depositWithoutMint", async () => {
  let cs;
  let user1;
  let owner;

  beforeEach(async function () {
    this.timeout(testsTimeout);

    [owner, user1] = await ethers.getSigners();

    cs = await localDeployV3();
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);
    cs.Investor = cs.InvestorRuSDC1;

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }
    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 5, user1);
  });

  it("updates poolValue without minting rTokens", async () => {
    // create initial liquidity by one deposit
    await quickdeposit(cs, user1, await toTokenWei(100_000, cs.TestUSDC));

    // take a snapshot of initial data
    const liquidityInitial = await cs.Investor.poolValue();
    const totalSupplyInitial = await cs.Investor.totalSupply();
    const balanceInitial = await cs.RevenueManager.balanceAvailable(
      cs.Investor.address
    );
    const rTokenPriceInitial = await cs.Investor.getWithdrawalTokenReturnAmount(
      await toTokenWei(1, cs.TestUSDC)
    );

    // owner - admin can depositAndBurn
    const amount = await toTokenWei(10_000, cs.TestUSDC);
    await cs.TestUSDC.connect(owner).approve(cs.Investor.address, amount);
    await setTokenBalanceFor(cs.TestUSDC, owner, amount);
    await cs.Investor.connect(owner).depositWithoutMint(amount, VERSION);

    // user1 is not admin and his transaction will be reverted
    const amount2 = await toTokenWei(10_000, cs.TestUSDC);
    await cs.TestUSDC.connect(user1).approve(cs.Investor.address, amount2);
    await setTokenBalanceFor(cs.TestUSDC, user1, amount2);
    await expect(
      cs.Investor.connect(user1).depositWithoutMint(amount2, VERSION)
    ).to.be.reverted;

    // take a snapshot after calling depositWithoutMint
    const liquidityAfter = await cs.Investor.poolValue();
    const totalSupplyAfter = await cs.Investor.totalSupply();
    const balanceAfter = await cs.RevenueManager.balanceAvailable(
      cs.Investor.address
    );
    const rTokenPriceAfter = await cs.Investor.getWithdrawalTokenReturnAmount(
      await toTokenWei(1, cs.TestUSDC)
    );

    // Liquidity is increased by amount owner sent into pool
    expect(liquidityAfter.sub(liquidityInitial)).to.be.equal(amount);

    // Balance of RevenueManager is increased by amount owner sent into pool
    expect(balanceAfter.sub(balanceInitial)).to.be.equal(amount);

    // totalSupply of rTokens remained unchanged
    expect(totalSupplyInitial).to.be.equal(totalSupplyAfter);

    // price of rToken goes up, user get more back for 1 rToken
    expect(rTokenPriceInitial).lt(rTokenPriceAfter);
  });
});
