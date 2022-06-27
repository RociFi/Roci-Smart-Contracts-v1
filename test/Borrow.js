const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const hre = require("hardhat");
const { testsTimeout } = require("../hardhat.config.js");
const {
  errors,
  LOAN_STATUSES,
  VERSION,
  NFCS_SCORE_TO_USDC_LTV,
  ROCI_PAYMENT_VERSION,
} = require("./constants.js");
const {
  localDeployV3,
  borrow,
  sleep,
  getLastLoanId,
  fromWeiInt,
  fromWeiNumber,
  toWei,
  setTokenBalanceFor,
  updateScore,
  mint,
  mine,
  configureForTests,
  configureAfterDeploy,
  calculateCollateralForBorrow,
  getLastBlockTimestamp,
  snapshot,
  revert,
  executeActions,
  toTokenWei,
  quickborrow,
  quickdeposit,
  fromTokenWei,
  getAllLoans,
  collectAllLoans,
  quickBorrowWithPreciseCollaterall,
  quickPayment,
  quickAddCollateralEther,
  generateOrUpdateScore,
  getPreciseInterest,
  getInvestorTypeByScore,
} = require("./lib.js");

//missing revert data in call exception; Transaction reverted without a reason string
///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("Borrowing and repayment", function () {
  let owner, user1, user2, user3, user4, user5;
  let userBalanceUsdcBefore;
  let cs;
  const loanPrincipal = "1000";
  let loanPrincipalWei;

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  beforeEach(async function () {
    this.timeout(testsTimeout);

    [owner, user1, user2, user3, user4, user5] = await ethers.getSigners();

    cs = await localDeployV3();

    await configureAfterDeploy(cs, true);
    await configureForTests(cs);

    cs.Investor = cs.InvestorRuSDC1;

    const initialLiquidity = await toTokenWei("250000", cs.TestUSDC);

    const isExisting = await cs.NFCS.tokenExistence(user1.address);

    if (!isExisting) {
      await mint(cs.NFCS, user1);
    }

    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await updateScore(cs.ScoreDB, NFCSID, 3, user1);

    await setTokenBalanceFor(cs.TestUSDC, owner, initialLiquidity);
    await cs.TestUSDC.connect(owner).approve(
      cs.Investor.address,
      initialLiquidity
    );
    await cs.Investor.connect(owner).depositPool(initialLiquidity, VERSION);
    await cs.Investor.setReserveRate(toWei(10));

    loanPrincipalWei = await toTokenWei(loanPrincipal, cs.TestUSDC);

    await generateOrUpdateScore(user1, 3, cs);
    await generateOrUpdateScore(user2, 3, cs);
    await generateOrUpdateScore(user3, 3, cs);
    await generateOrUpdateScore(user4, 3, cs);
    await generateOrUpdateScore(user5, 3, cs);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("deployed Investor correctly with symbol", async () => {
    this.timeout(0);

    const investorSymbol = await cs.Investor.symbol();

    expect(investorSymbol).to.equal("rUSDC1");
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Borrowing happy path", async function () {
    this.timeout(0);

    const userStartEth = "2";

    userBalanceUsdcBefore = await cs.TestUSDC.balanceOf(user1.address);

    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    expect(await cs.RevenueManager.totalShares()).to.be.equal(0);
    await cs.RevenueManager.addShares(
      [
        user1.address,
        user2.address,
        user3.address,
        user4.address,
        user5.address,
      ],
      [1, 2, 3, 4, 5]
    );
    expect(await cs.RevenueManager.getSharesLength()).to.be.equal(5);
    expect(await cs.RevenueManager.totalShares()).to.be.equal(15);

    await expect(cs.RevenueManager.removeShares([0, 0, 2])).to.be.revertedWith(
      errors.REVENUE_UNIQUE_INDEXES
    );
    await cs.RevenueManager.removeShares([0, 3, 2]);
    expect(await cs.RevenueManager.getSharesLength()).to.be.equal(2);
    expect(await cs.RevenueManager.totalShares()).to.be.equal(7);
    await cs.RevenueManager.addShares([user1.address], [1]);
    expect(await cs.RevenueManager.totalShares()).to.be.equal(8);

    await setTokenBalanceFor(cs.TestETH, user1, userStartEth);

    // const expectedRevert = `AddressHandler: account ${owner.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000001`;
    await expect(cs.RociPayment.issueBonds(123)).to.be.revertedWith(
      errors.ADDRESS_HANDLER_MISSING_ROLE_BONDS
    );

    await cs.Investor.setInterestRateAnnual(toWei("29.0"));
    const rate = await cs.Investor.interestRateAnnual();
    expect(rate.toString()).equal(toWei("29.0"));

    await cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      await toTokenWei("1", cs.TestETH)
    );

    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      userBalanceUsdcBefore
    );

    await expect(
      borrow(
        cs.RociPayment,
        cs.Investor,
        user1,
        "15000",
        NFCSID,
        "1",
        cs.TestETH,
        cs.TestUSDC
      )
    ).to.be.revertedWith(errors.PAYMENT_NOT_ENOUGH_COLLATERAL);

    await cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      await toTokenWei("10", cs.TestETH)
    );

    await setTokenBalanceFor(cs.TestETH, user1, "10.0");

    await expect(
      borrow(
        cs.RociPayment,
        cs.Investor,
        user1,
        "10000000",
        NFCSID,
        "10",
        cs.TestETH,
        cs.TestUSDC
      )
    ).to.be.revertedWith(errors.POOL_INVESTOR_NOT_ENOUGH_FUNDS);

    const loan = await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      loanPrincipal,
      NFCSID,
      "0.5",
      cs.TestETH,
      cs.TestUSDC
    );

    expect(LOAN_STATUSES[loan.status]).equal("APPROVED");

    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      userBalanceUsdcBefore.add(await toTokenWei(loanPrincipal, cs.TestUSDC))
    );

    expect(loan.principal).equal(loanPrincipalWei);

    await expect(
      borrow(
        cs.RociPayment,
        cs.Investor,
        user1,
        "20000",
        NFCSID,
        "1",
        cs.TestETH,
        cs.TestUSDC
      )
    ).to.be.revertedWith(errors.PAYMENT_NOT_ENOUGH_COLLATERAL);
    let loanPrincipal1 = "3000";

    const loan2 = await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      loanPrincipal1,
      NFCSID,
      "1",
      cs.TestETH,
      cs.TestUSDC
    );

    expect(loan2.principal).equal(
      await toTokenWei(loanPrincipal1, cs.TestUSDC)
    );
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Borrowing happy path but with manual collateral adding", async function () {
    this.timeout(0);

    await setTokenBalanceFor(
      cs.TestETH,
      user1,
      await toTokenWei("2", cs.TestETH)
    );

    cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      await toTokenWei("2", cs.TestETH)
    );

    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await cs.RociPayment.connect(user1).addCollateral(
      user1.address,
      cs.TestETH.address,
      await toTokenWei("1", cs.TestETH)
    );

    let loanPrincipal2 = "3000";

    const loan2 = await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      loanPrincipal2,
      NFCSID,
      0,
      cs.TestETH,
      cs.TestUSDC
    );

    expect(loan2.principal).equal(
      await toTokenWei(loanPrincipal2, cs.TestUSDC)
    );
  });

  it("Fetches LTV and LT from Loan struct", async function () {
    this.timeout(0);

    await setTokenBalanceFor(
      cs.TestETH,
      user1,
      await toTokenWei("2", cs.TestETH)
    );

    cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      await toTokenWei("2", cs.TestETH)
    );

    const NFCSID = Number(await cs.NFCS.getToken(user1.address));
    await updateScore(cs.ScoreDB, NFCSID, 3, user1);

    await cs.RociPayment.connect(user1).addCollateral(
      user1.address,
      cs.TestETH.address,
      await toTokenWei("1", cs.TestETH)
    );

    const loanPrincipal2 = BigNumber.from("3000");

    const loan = await borrow(
      cs.RociPayment, //paymentc
      cs.Investor, // investor,
      user1, // user,
      loanPrincipal2, // amount,
      NFCSID, // NFCSID,
      0, // collateralAmount,
      cs.TestETH, // collateralContract
      cs.TestUSDC // usdContract
    );

    expect(loan.ltv).to.be.equal(BigNumber.from("185000000000000000000"));
    expect(loan.lt).to.be.equal(BigNumber.from("205000000000000000000"));
  });

  it("Detects BorrowSuccessful event", async function () {
    this.timeout(0);

    const interestRateAnnual = await cs.Investor.interestRateAnnual();

    await setTokenBalanceFor(
      cs.TestETH,
      user1,
      await toTokenWei("2", cs.TestETH)
    );

    cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      await toTokenWei("2", cs.TestETH)
    );

    const NFCSID = await cs.NFCS.getToken(user1.address);
    await updateScore(cs.ScoreDB, NFCSID, 3, user1);

    await cs.RociPayment.connect(user1).addCollateral(
      user1.address,
      cs.TestETH.address,
      await toTokenWei("1", cs.TestETH)
    );
    const numberOfLoans = (
      await cs.RociPayment.getNumberOfLoans(user1.address)
    ).toString();

    let loanId = (
      await cs.RociPayment.getId(user1.address, numberOfLoans)
    ).toString();

    const hash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256"],
        [cs.RociPayment.address, loanId]
      )
    );
    let signature = await user1.signMessage(ethers.utils.arrayify(hash));
    await expect(
      cs.Investor.connect(user1).borrow(
        {
          _amount: await toTokenWei("3000", cs.TestUSDC),
          _NFCSID: NFCSID,
          _collateralAmount: toWei("0"),
          _collateral: cs.TestETH.address,
          _hash: hash,
          _signature: signature,
        },
        VERSION
      )
    )
      .to.emit(cs.Investor, "BorrowSuccessful")
      .withArgs(
        (await getLastBlockTimestamp()) + 1,
        user1.address,
        loanId,
        await toTokenWei("3000", cs.TestUSDC),
        // Fetching maturitydate from addressbook because cant fetch from loanLookup since the tx is inside an expect
        await cs.AddressBook.getMaturityDate(),
        cs.TestETH.address,
        toWei("0"),
        BigNumber.from("185000000000000000000"),
        BigNumber.from("205000000000000000000"),
        interestRateAnnual,
        3600
      );
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Repayment", async function () {
    this.timeout(0);

    const exitingCollateral = await cs.CollateralManager.getCollateralLookup(
      cs.RociPayment.address,
      user1.address
    );

    const loanPrincipal2 = "1000";
    const loanPrincipal2Wei = await toTokenWei(loanPrincipal2, cs.TestUSDC);

    userBalanceUsdcBefore = "200";
    const userBalanceUsdcBeforeWei = await toTokenWei(
      userBalanceUsdcBefore,
      cs.TestUSDC
    );

    await setTokenBalanceFor(cs.TestETH, user1, "1");

    const NFCSID = Number(await cs.NFCS.getToken(user1.address));
    await cs.Investor.setInterestRateAnnual(toWei("20"));

    const APR = parseInt(await cs.Investor.interestRateAnnual()) / 10000;
    expect(APR).gte(0);

    await setTokenBalanceFor(cs.TestUSDC, user1, userBalanceUsdcBefore);

    await cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      await toTokenWei("2", cs.TestETH)
    );

    let loan = await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      loanPrincipal2,
      NFCSID,
      1,
      cs.TestETH,
      cs.TestUSDC
    );

    expect(loan.principal).equal(loanPrincipal2Wei);
    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      loanPrincipal2Wei.add(userBalanceUsdcBeforeWei)
    );

    let afterBorrow = await snapshot();

    let loanId = await getLastLoanId(cs.RociPayment, user1.address);

    const loanPrincipal3 = "3000";
    const loanPrincipal3Wei = await toTokenWei(loanPrincipal3, cs.TestUSDC);

    await cs.TestUSDC.connect(user1).approve(
      cs.RociPayment.address,
      loanPrincipal3Wei
    );

    await expect(
      cs.RociPayment.connect(user1).payment(
        loanId,
        loanPrincipalWei.mul("2"),
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_AMOUNT_TOO_LARGE);

    await sleep(1);

    const share1 = 5,
      share2 = 95,
      repaymentAmount = await toTokenWei("999", cs.TestUSDC);

    await cs.RevenueManager.addShares(
      [user3.address, cs.RevenueManager.address],
      [share1, share2]
    );

    expect(await cs.RevenueManager.getSharesLength()).to.equal(2);
    expect(await cs.RevenueManager.totalShares()).to.be.equal(share1 + share2);

    const timeNow = (await getLastBlockTimestamp()) + 1;

    await expect(
      cs.RociPayment.connect(user1).payment(
        loanId,
        repaymentAmount,
        ROCI_PAYMENT_VERSION
      )
    )
      .to.emit(cs.RociPayment, "LoanRepaid")
      .withArgs(
        timeNow,
        user1.address,
        user1.address,
        loanId,
        loanPrincipalWei,
        repaymentAmount,
        5
      );

    const loanInterest = await getPreciseInterest(cs, loanId, timeNow);

    await expect(cs.Investor.collect([loanId], VERSION))
      .to.emit(cs.Investor, "LoanCollected")
      .withArgs(timeNow + 1, loanId, loanInterest, user1.address);

    const loan1 = await cs.RociPayment.loanLookup(loanId);

    expect(LOAN_STATUSES[loan1.status]).equal("PAIDLATE");

    expect(await cs.RociPayment.isComplete(loanId), "1").false;

    await cs.RociPayment.connect(user1).payment(
      loanId,
      await toTokenWei("1", cs.TestUSDC),
      ROCI_PAYMENT_VERSION
    );
    expect(await cs.RociPayment.isComplete(loanId), "2").false;

    const loan2 = await cs.RociPayment.loanLookup(loanId);

    expect(LOAN_STATUSES[loan2.status]).to.be.equal("PAIDLATE");

    const res = await cs.CollateralManager.getCollateralLookup(
      cs.RociPayment.address,
      user1.address
    );

    expect(res[1]).equal(
      exitingCollateral[1].add(await toTokenWei("1", cs.TestETH))
    );

    await updateScore(cs.ScoreDB, NFCSID, 2, user1);

    await expect(
      cs.RociPayment.connect(user1).claimCollateral(
        cs.TestETH.address,
        res[1],
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_CLAIM_COLLATERAL);

    await revert(afterBorrow);
    let loanInfo = await cs.RociPayment.loanLookup(loanId);

    await cs.TestUSDC.connect(user1).approve(
      cs.RociPayment.address,
      loanInfo.totalPaymentsValue
    );

    await cs.RociPayment.connect(user1).payment(
      loanId,
      loanInfo.totalPaymentsValue,
      ROCI_PAYMENT_VERSION
    );

    await setTokenBalanceFor(cs.TestETH, user1, "0");

    await expect(
      cs.RociPayment.connect(user1).claimCollateral(
        cs.TestETH.address,
        await toTokenWei("10", cs.TestETH),
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_CLAIM_COLLATERAL);

    await cs.RociPayment.connect(user1).claimCollateral(
      cs.TestETH.address,
      res[1],
      ROCI_PAYMENT_VERSION
    );

    expect(await cs.TestETH.balanceOf(user1.address)).equal(res[1]);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Withdrawal flow from RevenueManager", async function () {
    const validateBalance = (address, result) => ({
      call: cs.TestUSDC.balanceOf,
      args: [address],
      convert: (res) => fromTokenWei(res, cs.TestUSDC).then(Number),
      result,
    });
    /**
     * @typedef {import('./lib.js').Action} Action
     */
    /**
     * @type Action[]
     */
    const actions = [
      // owner withdraws all tokens from RevenueManager
      // token balance for RevenueManager should be zero
      {
        oneLinerCall: () =>
          cs.RevenueManager.connect(owner).withdrawToken(
            cs.TestUSDC.address,
            owner.address
          ),
        validations: [validateBalance(cs.RevenueManager.address, 0)],
      },
      // Set balance of owner to zero for final check
      {
        oneLinerCall: () => setTokenBalanceFor(cs.TestUSDC, owner, 0),
        validations: [validateBalance(owner.address, 0)],
      },
      // Borrow will be reverted
      {
        user: user2,
        token: cs.TestETH,
        amount: 10_000,
        score: 3,
        actionType: "borrow",
        revertError: "ERC20: transfer amount exceeds balance",
        validations: [validateBalance(cs.RevenueManager.address, 0)],
      },
      // someone deposit
      {
        user: user1,
        token: cs.TestUSDC,
        amount: 100_000,
        actionType: "deposit",
        mineTime: 0,
        validations: [validateBalance(cs.RevenueManager.address, 100_000)],
      },
      // Borrow works now
      {
        user: user2,
        token: cs.TestETH,
        amount: 10_000,
        score: 3,
        actionType: "borrow",
        validations: [validateBalance(cs.RevenueManager.address, 90_000)],
      },
      {
        user: user2,
        token: cs.TestUSDC,
        amount: 5000,
        actionType: "payment",
        validations: [validateBalance(cs.RevenueManager.address, 95_000)],
      },
      // everything in RevenueManager goes to owner
      {
        oneLinerCall: () =>
          cs.RevenueManager.connect(owner).withdrawToken(
            cs.TestUSDC.address,
            owner.address
          ),
        validations: [
          validateBalance(cs.RevenueManager.address, 0),
          validateBalance(owner.address, 95_000),
        ],
      },
    ];

    await executeActions(actions, cs);
  });

  it("Repayment after the undercollateralized loan was liquidated", async function () {
    const loanAmount = "1000";
    const collateral = "2000";

    const collateralPrice = fromWeiInt(
      (await cs.PriceFeed.getLatestPriceUSD(cs.TestETH.address))[0]
    );

    const collateralAmount = ethers.utils.formatEther(
      (await toTokenWei(collateral, cs.TestETH)).div(collateralPrice)
    );

    const NFCSID = await cs.NFCS.getToken(user1.address);
    await updateScore(cs.ScoreDB, NFCSID, 3, user1);

    await setTokenBalanceFor(cs.TestUSDC, user1, "0");
    await setTokenBalanceFor(cs.TestETH, user1, collateralAmount);

    await cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      await toTokenWei(collateralAmount, cs.TestETH)
    );

    await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      loanAmount,
      NFCSID,
      collateralAmount,
      cs.TestETH,
      cs.TestUSDC
    );

    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      await toTokenWei(loanAmount, cs.TestUSDC)
    );

    await sleep(2);

    const loanID = await getLastLoanId(cs.RociPayment, user1.address);

    await cs.Investor.collect([loanID], VERSION);
    let loan1 = await cs.RociPayment.loanLookup(loanID);

    const totalToPay = loan1.totalPaymentsValue;

    expect(await cs.RociPayment.isDelinquent(loanID)).to.equal(true);

    await cs.RociPayment.connect(owner).liquidateLoans(
      [loanID],
      ROCI_PAYMENT_VERSION
    );
    expect(
      await cs.RociPayment.loanLookup(loanID).then(
        ({ status }) => LOAN_STATUSES[status]
      )
    ).equal("CLOSED");
    await setTokenBalanceFor(
      cs.TestUSDC,
      user1,
      totalToPay.add(await toTokenWei("1", cs.TestUSDC))
    );

    await cs.TestUSDC.connect(user1).approve(
      cs.RociPayment.address,
      totalToPay
    );

    await cs.RociPayment.connect(user1).payment(
      loanID,
      totalToPay,
      ROCI_PAYMENT_VERSION
    );

    const loan = await cs.RociPayment.loanLookup(loanID);

    expect(LOAN_STATUSES[loan.status]).equal("PAIDLATE");

    expect(fromWeiInt(await cs.TestUSDC.balanceOf(user1.address))).equal(0);
  });

  it("Reverts when liquidating a non-delinquent loan", async function () {
    const loanAmount = "1000";
    const collateral = "2000";

    const collateralPrice = fromWeiInt(
      (await cs.PriceFeed.getLatestPriceUSD(cs.TestETH.address))[0]
    );

    const collateralAmount = ethers.utils.formatEther(
      (await toTokenWei(collateral, cs.TestETH)).div(collateralPrice)
    );

    //const loanDurationMonth = 800.0;

    const NFCSID = await cs.NFCS.getToken(user1.address);
    await updateScore(cs.ScoreDB, NFCSID, 3, user1);

    await setTokenBalanceFor(cs.TestUSDC, user1, "0");
    await setTokenBalanceFor(cs.TestETH, user1, collateralAmount);

    await cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      await toTokenWei(collateralAmount, cs.TestETH)
    );

    await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      loanPrincipal,
      NFCSID,
      collateralAmount,
      cs.TestETH,
      cs.TestUSDC
    );
    // Check user has USDC equivalent to amount borrowed
    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      await toTokenWei(loanAmount, cs.TestUSDC)
    );

    // sleep(loanDurationMonth + 1);

    const loanID = await getLastLoanId(cs.RociPayment, user1.address);

    expect(await cs.RociPayment.isDelinquent(loanID)).equal(false);

    await expect(
      cs.RociPayment.connect(owner).liquidateLoans(
        [loanID],
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_LOAN_NOT_DELINQUENT);
  });

  it("Collecting fully paid loan", async function () {
    const firstCollateral = "1";
    const firstBorrowAmount = "5550";

    await cs.ScoreDB.setConfig(
      [cs.TestUSDC.address],
      [5],
      [toWei(150.0)],
      [toWei(150.0)]
    );

    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await setTokenBalanceFor(cs.TestETH, user1, firstCollateral);

    await cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      await toTokenWei(firstCollateral, cs.TestETH)
    );

    await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      firstBorrowAmount,
      NFCSID,
      firstCollateral,
      cs.TestETH,
      cs.TestUSDC
    );
    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      await toTokenWei(firstBorrowAmount, cs.TestUSDC)
    );

    let loanId = await getLastLoanId(cs.RociPayment, user1.address);

    await sleep(1);

    await cs.Investor.collect([loanId], VERSION);

    await cs.TestUSDC.connect(user1).approve(
      cs.RociPayment.address,
      await toTokenWei(firstBorrowAmount, cs.TestUSDC)
    );

    await cs.RociPayment.connect(user1).payment(
      loanId,
      await toTokenWei(firstBorrowAmount, cs.TestUSDC),
      ROCI_PAYMENT_VERSION
    );

    const revBalanceBefore = await cs.TestUSDC.balanceOf(
      cs.RevenueManager.address
    );

    await cs.Investor.collect([loanId], VERSION);

    expect(
      (await cs.TestUSDC.balanceOf(cs.RevenueManager.address)).sub(
        revBalanceBefore
      )
    ).equal(await toTokenWei(firstBorrowAmount, cs.TestUSDC));
  });
});

describe("Deploy Tests for Investor Split with Limits", function () {
  let owner, user1, user2, user3, user4;

  let userBalanceUsdcBefore;

  let cs;

  let initialLiquidity;

  const loanPrincipal = "1000";
  let loanPrincipalWei;
  const loanPrincipal2 = "100";
  const loanPrincipal3 = "500";
  const loanPrincipal4 = "50";
  const dailySystemLimit = "1600";
  const dailyUserLimit = "1000";
  const globalSystemLimit = "1700";
  const globalUserLimit = "1500";
  const globalNFCSLimit = "150";
  const globalNFCSLimit2 = "1600";

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  beforeEach(async function () {
    this.timeout(testsTimeout);

    [owner, user1, user2, user3, user4] = await ethers.getSigners();

    cs = await localDeployV3();

    await configureAfterDeploy(cs, true);
    await configureForTests(cs);

    cs.Investor = cs.InvestorRuSDC1;

    initialLiquidity = await toTokenWei("250000", cs.TestUSDC);

    await mint(cs.NFCS, user1, VERSION);
    await mint(cs.NFCS, user2, VERSION);
    await mint(cs.NFCS, user3, VERSION);

    // await mint(cs.NFCS, user3);
    // await mint(cs.NFCS, user4);

    const NFCSID = Number(await cs.NFCS.getToken(user1.address));
    const NFCSID2 = Number(await cs.NFCS.getToken(user2.address));
    const NFCSID3 = Number(await cs.NFCS.getToken(user3.address));
    // const NFCSID3 = Number(await cs.NFCS.getToken(user3.address));
    // const NFCSID4 = Number(await cs.NFCS.getToken(user4.address));
    await updateScore(cs.ScoreDB, NFCSID, 2, user1);
    await updateScore(cs.ScoreDB, NFCSID2, 3, user2);
    await updateScore(cs.ScoreDB, NFCSID3, 1, user3);
    // await updateScore(cs.ScoreDB, NFCSID3, 5, user3);
    // await updateScore(cs.ScoreDB, NFCSID4, 5, user4);
    await setTokenBalanceFor(cs.TestUSDC, owner, initialLiquidity);
    await cs.TestUSDC.connect(owner).approve(
      cs.Investor.address,
      initialLiquidity
    );
    await cs.Investor.connect(owner).depositPool(initialLiquidity, VERSION);
    await cs.Investor.setReserveRate(toWei(10));

    loanPrincipalWei = await toTokenWei(loanPrincipal, cs.TestUSDC);

    await generateOrUpdateScore(user1, 1, cs);
    await generateOrUpdateScore(user2, 2, cs);
    await generateOrUpdateScore(user3, 3, cs);
    await generateOrUpdateScore(user4, 2, cs);
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Borrowing path with limits check", async function () {
    this.timeout(0);

    const userStartEth = "2";
    const expectStatus = "APPROVED";

    userBalanceUsdcBefore = await cs.TestUSDC.balanceOf(user1.address);

    const NFCSID = Number(await cs.NFCS.getToken(user1.address));
    const NFCSID2 = Number(await cs.NFCS.getToken(user2.address));
    const NFCSID3 = Number(await cs.NFCS.getToken(user3.address));

    await setTokenBalanceFor(cs.TestETH, user1, userStartEth);
    await setTokenBalanceFor(cs.TestETH, user2, userStartEth);
    await setTokenBalanceFor(cs.TestETH, user3, userStartEth);

    await cs.Investor.setInterestRateAnnual(toWei("29.0"));

    await cs.AddressBook.connect(owner).setDailyLimit(
      await toTokenWei(dailySystemLimit, cs.TestUSDC)
    );
    await cs.AddressBook.connect(owner).setUserDailyLimit(
      await toTokenWei(dailyUserLimit, cs.TestUSDC)
    );
    await cs.AddressBook.connect(owner).setUserGlobalLimit(
      await toTokenWei(globalUserLimit, cs.TestUSDC)
    );
    await cs.AddressBook.connect(owner).setGlobalLimit(
      await toTokenWei(globalSystemLimit, cs.TestUSDC)
    );

    await cs.AddressBook.connect(owner).setGlobalNFCSLimit(
      NFCSID2,
      await toTokenWei(globalNFCSLimit, cs.TestUSDC)
    );

    await cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      await toTokenWei("10", cs.TestETH)
    );

    await setTokenBalanceFor(cs.TestETH, user1, "10");

    await cs.TestETH.connect(user2).approve(
      cs.CollateralManager.address,
      await toTokenWei("10", cs.TestETH)
    );

    await setTokenBalanceFor(cs.TestETH, user2, "10");

    await cs.TestETH.connect(user3).approve(
      cs.CollateralManager.address,
      await toTokenWei("10", cs.TestETH)
    );

    await setTokenBalanceFor(cs.TestETH, user3, "10");

    const loan = await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      loanPrincipal,
      NFCSID,
      0.5,
      cs.TestETH,
      cs.TestUSDC
    );

    expect(LOAN_STATUSES[loan.status]).equal(expectStatus);

    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      userBalanceUsdcBefore.add(loanPrincipalWei)
    );
    expect(loan.principal).equal(loanPrincipalWei);

    await expect(
      borrow(
        cs.RociPayment,
        cs.Investor,
        user1,
        loanPrincipal3,
        NFCSID,
        0.5,
        cs.TestETH,
        cs.TestUSDC
      )
    ).to.be.revertedWith(errors.LOAN_DAILY_LIMIT_USER);

    await expect(
      borrow(
        cs.RociPayment,
        cs.Investor,
        user3,
        loanPrincipal,
        NFCSID3,
        0.5,
        cs.TestETH,
        cs.TestUSDC
      )
    ).to.be.revertedWith(errors.LOAN_DAILY_LIMIT);

    userBalanceUsdcBefore = await cs.TestUSDC.balanceOf(user2.address);
    const loan2 = await borrow(
      cs.RociPayment,
      cs.Investor,
      user2,
      loanPrincipal2,
      NFCSID2,
      0.5,
      cs.TestETH,
      cs.TestUSDC
    );

    expect(LOAN_STATUSES[loan2.status]).equal(expectStatus);

    expect(await cs.TestUSDC.balanceOf(user2.address)).equal(
      userBalanceUsdcBefore.add(await toTokenWei(loanPrincipal2, cs.TestUSDC))
    );
    expect(loan2.principal).equal(
      await toTokenWei(loanPrincipal2, cs.TestUSDC)
    );

    await hre.network.provider.send("evm_increaseTime", [60 * 60 * 24]);
    await hre.network.provider.send("evm_mine");

    await expect(
      borrow(
        cs.RociPayment,
        cs.Investor,
        user1,
        loanPrincipal3,
        NFCSID,
        0.5,
        cs.TestETH,
        cs.TestUSDC
      )
    ).to.be.revertedWith(errors.PAYMENT_NFCS_OUTDATED);

    await updateScore(cs.ScoreDB, NFCSID, 1, user1);
    await updateScore(cs.ScoreDB, NFCSID2, 2, user2);
    await updateScore(cs.ScoreDB, NFCSID3, 3, user3);
    userBalanceUsdcBefore = await cs.TestUSDC.balanceOf(user1.address);
    const loan3 = await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      loanPrincipal3,
      NFCSID,
      0.5,
      cs.TestETH,
      cs.TestUSDC
    );

    expect(LOAN_STATUSES[loan3.status]).equal(expectStatus);

    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      userBalanceUsdcBefore.add(await toTokenWei(loanPrincipal3, cs.TestUSDC))
    );
    expect(loan3.principal).equal(
      await toTokenWei(loanPrincipal3, cs.TestUSDC)
    );

    userBalanceUsdcBefore = await cs.TestUSDC.balanceOf(user2.address);
    const loan4 = await borrow(
      cs.RociPayment,
      cs.Investor,
      user2,
      loanPrincipal4,
      NFCSID2,
      0.5,
      cs.TestETH,
      cs.TestUSDC
    );
    expect(LOAN_STATUSES[loan4.status]).equal(expectStatus);

    expect(await cs.TestUSDC.balanceOf(user2.address)).equal(
      userBalanceUsdcBefore.add(await toTokenWei(loanPrincipal4, cs.TestUSDC))
    );
    expect(loan4.principal).equal(
      await toTokenWei(loanPrincipal4, cs.TestUSDC)
    );

    await expect(
      borrow(
        cs.RociPayment,
        cs.Investor,
        user1,
        loanPrincipal3,
        NFCSID,
        0.5,
        cs.TestETH,
        cs.TestUSDC
      )
    ).to.be.revertedWith(errors.LOAN_TOTAL_LIMIT_USER);

    await cs.AddressBook.connect(owner).setGlobalNFCSLimit(
      NFCSID,
      await toTokenWei(globalNFCSLimit2, cs.TestUSDC)
    );

    userBalanceUsdcBefore = await cs.TestUSDC.balanceOf(user1.address);

    const loan5 = await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      loanPrincipal4,
      NFCSID,
      0.5,
      cs.TestETH,
      cs.TestUSDC
    );

    expect(LOAN_STATUSES[loan5.status]).equal(expectStatus);

    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      userBalanceUsdcBefore.add(await toTokenWei(loanPrincipal4, cs.TestUSDC))
    );
    expect(loan5.principal).equal(
      await toTokenWei(loanPrincipal4, cs.TestUSDC)
    );

    await expect(
      borrow(
        cs.RociPayment,
        cs.Investor,
        user3,
        loanPrincipal,
        NFCSID3,
        0.5,
        cs.TestETH,
        cs.TestUSDC
      )
    ).to.be.revertedWith(errors.LOAN_TOTAL_LIMIT);

    await expect(
      borrow(
        cs.RociPayment,
        cs.Investor,
        user2,
        loanPrincipal4,
        NFCSID2,
        0.5,
        cs.TestETH,
        cs.TestUSDC
      )
    ).to.be.revertedWith(errors.LOAN_TOTAL_LIMIT_NFCS);
  });

  it("getGlobalDailyBorrowedAmount and getUserDailyBorrowedAmount", async () => {
    const oneK = await toTokenWei("1000", cs.TestUSDC);
    const elevenK = await toTokenWei("11000", cs.TestUSDC);
    const twentyK = await toTokenWei("20000", cs.TestUSDC);
    const tenK = await toTokenWei("10000", cs.TestUSDC);

    await cs.Investor.setInterestRateAnnual(toWei(10));
    await cs.Investor.setReserveRate(toWei(10));
    await cs.AddressBook.setDailyLimit(await toTokenWei("30000", cs.TestUSDC));
    await cs.AddressBook.setUserDailyLimit(
      await toTokenWei("20000", cs.TestUSDC)
    );

    /**
     * @typedef {import('./lib.js').Action} Action
     * @typedef {import('./lib.js').Validation} Validation
     */
    /**
     * @returns Validation
     */
    const validationGlobal = (result) => ({
      call: cs.RociPayment.getGlobalDailyBorrowedAmount,
      convert: (res) => res,
      result,
    });
    /**
     * @returns Validation
     */
    const validationUser = (user, result) => ({
      call: cs.RociPayment.getUserDailyBorrowedAmount,
      args: [user.address],
      convert: (res) => res,
      result,
    });
    /**
     * @type Action[]
     */
    const actions = [
      {
        user: user1,
        token: cs.TestUSDC,
        amount: 100_000,
        actionType: "deposit",
        validations: [validationGlobal("0"), validationUser(user1, "0")],
      },
      {
        user: user2,
        token: cs.TestETH,
        amount: 1000,
        score: 3,
        actionType: "borrow",
        mineTime: 12 * 60 * 60, // 12 hours
        validations: [validationGlobal(oneK), validationUser(user2, oneK)],
      },
      {
        user: user3,
        token: cs.TestETH,
        amount: 10_000,
        score: 3,
        actionType: "borrow",
        mineTime: 24 * 60 * 60, // 1 day
        validations: [
          validationGlobal(elevenK),
          validationUser(user2, oneK),
          validationUser(user3, tenK),
        ],
      },
      {
        user: user4,
        token: cs.TestETH,
        amount: 20_000,
        score: 3,
        actionType: "borrow",
        mineTime: 12 * 60 * 60, // 12 hours
        validations: [
          validationGlobal(twentyK),
          validationUser(user2, "0"),
          validationUser(user3, "0"),
        ],
      },
      {
        user: user3,
        token: cs.TestUSDC,
        amount: 5000,
        actionType: "payment",
        mineTime: 24 * 60 * 60, // 1 day
        validations: [
          validationGlobal(twentyK),
          validationUser(user2, "0"),
          validationUser(user3, "0"),
          validationUser(user4, twentyK),
        ],
      },
      {
        user: user2,
        token: cs.TestETH,
        amount: 1000,
        score: 3,
        actionType: "borrow",
        mineTime: 1 * 60 * 60, // 1 hours
        validations: [validationUser(user2, oneK)],
      },
      {
        user: user2,
        token: cs.TestETH,
        amount: 10_000,
        score: 3,
        actionType: "borrow",
        mineTime: 1 * 60 * 60, // 1 hours
        validations: [validationUser(user2, elevenK)],
      },
      {
        user: user2,
        token: cs.TestETH,
        amount: 20_000,
        score: 3,
        actionType: "borrow",
        mineTime: 48 * 60 * 60, // 2 days
        revertError: errors.LOAN_DAILY_LIMIT_USER,
      },
      {
        user: user2,
        token: cs.TestETH,
        amount: 20_000,
        score: 3,
        actionType: "borrow",
        validations: [
          validationGlobal(twentyK),
          validationUser(user2, twentyK),
        ],
      },
      {
        user: user1,
        token: cs.TestETH,
        amount: 20_000,
        score: 3,
        actionType: "borrow",
        revertError: errors.LOAN_DAILY_LIMIT,
      },
    ];

    await executeActions(actions, cs);
  });

  it("Borrowing with changing collateral", async function () {
    const firstCollateral = "1";
    const firstBorrowAmount = "5550";
    const secondCollateral = "1.5";
    const secondBorrowAmount = "1000";

    await cs.ScoreDB.setConfig(
      [cs.TestUSDC.address],
      [5],
      [toWei(150.0)],
      [toWei(150.0)]
    );

    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await setTokenBalanceFor(cs.TestETH, user1, firstCollateral);

    await cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      await toTokenWei(firstCollateral, cs.TestETH)
    );

    await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      firstBorrowAmount,
      NFCSID,
      firstCollateral,
      cs.TestETH,
      cs.TestUSDC
    );

    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      await toTokenWei(firstBorrowAmount, cs.TestUSDC)
    );

    expect(
      borrow(
        cs.RociPayment,
        cs.Investor,
        user1,
        secondBorrowAmount,
        NFCSID,
        firstCollateral,
        cs.TestETH,
        cs.TestUSDC
      )
    ).to.be.reverted;

    await setTokenBalanceFor(cs.TestETH, user1, secondCollateral);

    await cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,

      await toTokenWei(secondCollateral, cs.TestETH)
    );

    await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      secondBorrowAmount,
      NFCSID,
      secondCollateral,
      cs.TestETH,
      cs.TestUSDC
    );

    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      (await toTokenWei(firstBorrowAmount, cs.TestUSDC)).add(
        await toTokenWei(secondBorrowAmount, cs.TestUSDC)
      )
    );
  });

  /*
  Scenario:
  1. User make 3 loans:
    - 200USDC
    - 300USDC
    - 400USDC
  2. Repay second loan(300USDC)
  3. User should be able to get only collateral for second loan(300USDC)
  */
  it("Withdraw collateral from non-repaid loans", async function () {
    //loanAmount, collateral. collateral is calculated below
    const toBorrow = [
      ["200", null],
      ["300", null],
      ["400", null],
    ];
    //const borrowDuration = 30 * 24 * 60 * 60;

    await setTokenBalanceFor(cs.TestUSDC, user1, "0");

    //needed collateral calculating
    for (let loan of toBorrow) {
      loan[1] = await calculateCollateralForBorrow(
        cs.PriceFeed,
        await toTokenWei(loan[0], cs.TestUSDC),
        "135", //because of score=5
        cs.TestETH,
        cs.TestUSDC
      );
    }

    const sumOfCollateral = toBorrow.reduce(
      (sum, loan) => sum.add(loan[1]),

      toWei("0")
    );

    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await setTokenBalanceFor(cs.TestETH, user1, sumOfCollateral);

    await cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      sumOfCollateral
    );

    let loans = [];

    for (let loan of toBorrow) {
      await borrow(
        cs.RociPayment,
        cs.Investor,
        user1,
        loan[0],
        NFCSID,
        ethers.utils.formatEther(loan[1]),
        cs.TestETH,
        cs.TestUSDC
      );
      loans.push(await getLastLoanId(cs.RociPayment, user1.address));
    }

    const secondLoan = loans[1];

    await setTokenBalanceFor(cs.TestETH, user1, "0");

    await expect(
      cs.RociPayment.connect(user1).claimCollateral(
        cs.TestETH.address,
        sumOfCollateral,
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_CLAIM_COLLATERAL);

    const secondLoanInfo = await cs.RociPayment.loanLookup(secondLoan);

    const toPay = secondLoanInfo.totalPaymentsValue;

    await cs.TestUSDC.connect(user1).approve(cs.RociPayment.address, toPay);

    await cs.RociPayment.connect(user1).payment(
      secondLoan,
      toPay,
      ROCI_PAYMENT_VERSION
    );

    expect(await cs.RociPayment.isComplete(secondLoan)).true;

    await cs.RociPayment.connect(user1).claimCollateral(
      cs.TestETH.address,
      toBorrow[1][1],
      ROCI_PAYMENT_VERSION
    );

    expect(await cs.TestETH.balanceOf(user1.address)).equal(toBorrow[1][1]);
  });

  it("Claim collateral", async function () {
    await setTokenBalanceFor(cs.TestUSDC, user1, "0");

    const sumOfCollateral = "1";
    const sumToBorrow = "1000";
    const sumToBorrowWei = await toTokenWei(sumToBorrow, cs.TestUSDC);

    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await setTokenBalanceFor(cs.TestETH, user1, sumOfCollateral);

    await cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,
      await toTokenWei(sumOfCollateral, cs.TestETH)
    );

    await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      sumToBorrow,
      //borrowDuration + timestampBefore,
      NFCSID,
      sumOfCollateral,
      cs.TestETH,
      cs.TestUSDC
    );

    expect(await cs.TestUSDC.balanceOf(user1.address)).to.be.equal(
      sumToBorrowWei
    );

    expect(
      fromWeiNumber(await cs.TestETH.balanceOf(user1.address))
    ).to.be.equal(0);

    await expect(
      cs.RociPayment.connect(user1).claimCollateral(
        cs.TestETH.address,
        await toTokenWei("1", cs.TestETH),
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_CLAIM_COLLATERAL);

    expect(
      fromWeiNumber(await cs.TestETH.balanceOf(user1.address))
    ).to.be.equal(0);

    await cs.RociPayment.connect(user1).claimCollateral(
      cs.TestETH.address,
      await toTokenWei("0.1", cs.TestETH),
      ROCI_PAYMENT_VERSION
    );
    expect(await cs.TestETH.balanceOf(user1.address)).to.be.equal(
      await toTokenWei("0.1", cs.TestETH)
    );

    await cs.TestUSDC.connect(user1).approve(
      cs.RociPayment.address,
      await toTokenWei("1000", cs.TestUSDC)
    );

    let loanId = await getLastLoanId(cs.RociPayment, user1.address);

    await cs.RociPayment.connect(user1).payment(
      loanId,
      await toTokenWei("1000", cs.TestUSDC),
      ROCI_PAYMENT_VERSION
    );

    await cs.RociPayment.connect(user1).claimCollateral(
      cs.TestETH.address,
      await toTokenWei("0.9", cs.TestETH),
      ROCI_PAYMENT_VERSION
    );
    expect(await cs.TestETH.balanceOf(user1.address)).to.be.equal(
      await toTokenWei("1", cs.TestETH)
    );
  });

  it("Late/overdue fees", async function () {
    this.timeout(0);
    const rate = await cs.Investor.interestRateAnnual();

    const firstCollateral = "1";
    const firstBorrowAmount = "5550";

    await cs.ScoreDB.setConfig(
      [cs.TestUSDC.address],
      [5],
      [toWei(150.0)],
      [toWei(150.0)]
    );

    const NFCSID = Number(await cs.NFCS.getToken(user1.address));

    await setTokenBalanceFor(cs.TestETH, user1, firstCollateral);

    await cs.TestETH.connect(user1).approve(
      cs.CollateralManager.address,

      await toTokenWei(firstCollateral, cs.TestETH)
    );

    await borrow(
      cs.RociPayment,
      cs.Investor,
      user1,
      firstBorrowAmount,
      NFCSID,
      firstCollateral,
      cs.TestETH,
      cs.TestUSDC
    );
    const loanId = await getLastLoanId(cs.RociPayment, user1.address);
    let loan1 = await cs.RociPayment.loanLookup(loanId);

    expect(await cs.TestUSDC.balanceOf(user1.address)).equal(
      await toTokenWei(firstBorrowAmount, cs.TestUSDC)
    );

    await mine(3600 * 24 * 1); // wait 1 day

    await cs.Investor.collect([loanId], VERSION);

    loan1 = await cs.RociPayment.loanLookup(loanId);

    expect(fromWeiNumber(loan1.totalPaymentsValue)).gte(0);

    await mine(3600 * 24 * 59); // wait 59 days

    await cs.Investor.collect([loanId], VERSION);

    loan1 = await cs.RociPayment.loanLookup(loanId);

    let expectedInterestWithoutPenalty = (
      await toTokenWei(firstBorrowAmount, cs.TestUSDC)
    )
      .mul(rate)
      .div(toWei(100))
      .mul(2)
      .div(12);

    await sleep(2);
    await cs.Investor.collect([loanId], VERSION);

    loan1 = await cs.RociPayment.loanLookup(loanId);
    expect(loan1.totalPaymentsValue).to.not.equal(
      (await toTokenWei(firstBorrowAmount, cs.TestUSDC)).add(
        expectedInterestWithoutPenalty
      )
    );

    let realPayments = loan1.totalPaymentsValue.mul(2);
    await setTokenBalanceFor(cs.TestUSDC, user1, realPayments);

    await cs.TestUSDC.connect(user1).approve(
      cs.RociPayment.address,
      realPayments
    );

    await expect(
      cs.RociPayment.connect(user1).payment(
        loanId,
        realPayments,
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_AMOUNT_TOO_LARGE);

    realPayments = realPayments.div(2);

    await cs.RociPayment.connect(user1).payment(
      loanId,
      realPayments,
      ROCI_PAYMENT_VERSION
    );

    let revenueManagerBalanceBefore = await cs.RevenueManager.balanceAvailable(
      cs.Investor.address
    );

    await cs.Investor.collect([loanId], VERSION);

    let revenueManagerBalanceAfter = await cs.RevenueManager.balanceAvailable(
      cs.Investor.address
    );

    expect(
      revenueManagerBalanceAfter.sub(revenueManagerBalanceBefore)
    ).to.equal(realPayments);

    expect(await cs.RociPayment.isComplete(loanId)).true;
  });

  it("Collecting multiple loans", async function () {
    const toDepositFirst = await toTokenWei("1000", cs.TestUSDC);
    const toDepositSecond = await toTokenWei("10", cs.TestUSDC);

    const balanceBefore = fromWeiNumber(
      await cs.RevenueManager.balanceAvailable(cs.Investor.address)
    );

    await cs.Investor.setReserveRate(toWei(10));

    await quickdeposit(cs, user1, toDepositFirst);
    await quickdeposit(cs, user2, toDepositFirst);

    let loanIds = [];

    let loanID;

    loanID = await quickborrow(cs, user1, toDepositSecond);
    loanIds.push(loanID);
    await sleep(1);
    await cs.Investor.collect(loanIds, VERSION);
    loanID = await quickborrow(cs, user2, toDepositSecond);
    loanIds.push(loanID);
    await sleep(1);
    await cs.Investor.collect(loanIds, VERSION);
    await cs.Investor.collect(loanIds, VERSION);
    expect(
      fromWeiNumber(
        await cs.RevenueManager.balanceAvailable(cs.Investor.address)
      ) - balanceBefore
    ).to.gt(0);
  });

  it("Borrow is not possible if score is changed", async () => {
    await quickdeposit(cs, user1, await toTokenWei(100_000, cs.TestUSDC));
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 1000);
    await expect(
      quickBorrowWithPreciseCollaterall(cs, user2, 2, cs.TestETH, 1000)
    ).to.be.revertedWith(errors.INVESTOR_BORROW_WITH_ANOTHER_SCORE);
  });

  it("Multiple borrow is possible with the same score", async () => {
    await quickdeposit(cs, user1, await toTokenWei(100_000, cs.TestUSDC));
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 1000);
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 2000);
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 3000);
  });

  it("getMaxWithdrawableCollateral returns whole collateral if all loans are repaid and user can claim collateral back", async () => {
    await quickdeposit(cs, user1, await toTokenWei(100_000, cs.TestUSDC));
    const col1 = await quickBorrowWithPreciseCollaterall(
      cs,
      user2,
      3,
      cs.TestETH,
      1000
    );
    const col2 = await quickBorrowWithPreciseCollaterall(
      cs,
      user2,
      3,
      cs.TestETH,
      2000
    );
    const colSum = col1.add(col2);
    const loans = await getAllLoans(cs, user2.address);
    await quickPayment(cs, user2, 1000, loans[0].loanId);
    await quickPayment(cs, user2, 2000, loans[1].loanId);
    expect(
      await cs.RociPayment.connect(user2)
        .getMaxWithdrawableCollateral()
        .then((r) => r.eq(colSum))
    ).to.be.true;
    await cs.RociPayment.connect(user2).claimCollateral(
      cs.TestETH.address,
      colSum,
      ROCI_PAYMENT_VERSION
    );
    expect(
      await cs.RociPayment.connect(user2)
        .getMaxWithdrawableCollateral()
        .then((r) => r.eq(toWei(0)))
    ).to.be.true;
  });

  it("User cannot claim more collateral than what was deposited", async () => {
    await quickdeposit(cs, user1, await toTokenWei(100_000, cs.TestUSDC));
    const col1 = await quickBorrowWithPreciseCollaterall(
      cs,
      user2,
      3,
      cs.TestETH,
      1000
    );
    const loans = await getAllLoans(cs, user2.address);
    await quickPayment(cs, user2, 1000, loans[0].loanId);
    expect(
      await cs.RociPayment.connect(user2)
        .getMaxWithdrawableCollateral()
        .then((r) => r.eq(col1))
    ).to.be.true;
    await expect(
      cs.RociPayment.connect(user2).claimCollateral(
        cs.TestETH.address,
        col1.mul(2),
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_CLAIM_COLLATERAL);
    await cs.RociPayment.connect(user2).claimCollateral(
      cs.TestETH.address,
      col1,
      ROCI_PAYMENT_VERSION
    );
    expect(
      await cs.RociPayment.connect(user2)
        .getMaxWithdrawableCollateral()
        .then((r) => r.eq(toWei(0)))
    ).to.be.true;
    // when user took all collateral back he cannot claim anymore, even 0.000000001
    await expect(
      cs.RociPayment.connect(user2).claimCollateral(
        cs.TestETH.address,
        toWei("0.000000001"),
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_CLAIM_COLLATERAL);
  });

  it("getMaxWithdrawableCollateral returns whole collateral if no loans were made, but user simply deposited collateral", async () => {
    const wholeCollateral = await toTokenWei("10", cs.TestETH);
    await quickAddCollateralEther(user2, wholeCollateral, cs);
    expect(
      await cs.RociPayment.connect(user2)
        .getMaxWithdrawableCollateral()
        .then((r) => r.eq(wholeCollateral))
    ).to.be.true;
  });

  it("User can deposit collateral and take a loan without depositing any additional collateral", async () => {
    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, 2000);
    const wholeCollateral = await toTokenWei("1", cs.TestETH);
    await quickAddCollateralEther(user2, wholeCollateral, cs);
    const NFCSID = generateOrUpdateScore(user2, 3, cs);
    const maxWithDrawBefore = await cs.RociPayment.connect(
      user2
    ).getMaxWithdrawableCollateral();
    const [, collateralBeforeBorrow] =
      await cs.CollateralManager.getCollateralLookup(
        cs.RociPayment.address,
        user2.address
      );
    expect(maxWithDrawBefore.eq(collateralBeforeBorrow)).to.be.true;
    await borrow(
      cs.RociPayment,
      cs.Investor,
      user2,
      1000,
      NFCSID,
      0,
      cs.TestETH,
      cs.TestUSDC
    );
    const [, collateralAfterBorrow] =
      await cs.CollateralManager.getCollateralLookup(
        cs.RociPayment.address,
        user2.address
      );
    expect(collateralAfterBorrow.eq(collateralBeforeBorrow)).to.be.true;
    const maxWithDrawAfter = await cs.RociPayment.connect(
      user2
    ).getMaxWithdrawableCollateral();
    expect(maxWithDrawAfter.lt(maxWithDrawBefore)).to.be.true;
    await expect(
      borrow(
        cs.RociPayment,
        cs.Investor,
        user2,
        100_000,
        NFCSID,
        0,
        cs.TestETH,
        cs.TestUSDC
      )
    ).to.be.revertedWith(errors.PAYMENT_NOT_ENOUGH_COLLATERAL);
  });

  it("User can claim any amount of deposited collateral without open loans", async () => {
    const wholeCollateral = await toTokenWei("10", cs.TestETH);
    const partCollateral = await toTokenWei("1", cs.TestETH);
    const diffCollateral = wholeCollateral.sub(partCollateral);
    await quickAddCollateralEther(user2, wholeCollateral, cs);
    await cs.RociPayment.connect(user2).claimCollateral(
      cs.TestETH.address,
      partCollateral,
      ROCI_PAYMENT_VERSION
    );
    expect(
      await cs.RociPayment.connect(user2)
        .getMaxWithdrawableCollateral()
        .then((r) => r.eq(diffCollateral))
    ).to.be.true;
    await cs.RociPayment.connect(user2).claimCollateral(
      cs.TestETH.address,
      diffCollateral,
      ROCI_PAYMENT_VERSION
    );
    expect(
      await cs.RociPayment.connect(user2)
        .getMaxWithdrawableCollateral()
        .then((r) => r.eq(toWei(0)))
    ).to.be.true;
  });

  it("Keep claimCollateral gas limit under 500 000", async () => {
    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, 2000);
    await quickdeposit(cs, user1, await toTokenWei(100_000, cs.TestUSDC));

    // 1 Borrow
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 1000);
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 2000);
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 3000);
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 4000);
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 5000);
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 5000);
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 7000);
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 8000);

    const loans = await getAllLoans(cs, user2.address);
    await quickPayment(cs, user2, 3000, loans[2].loanId);
    const afterPayment = await cs.RociPayment.connect(
      user2
    ).getMaxWithdrawableCollateral();

    const txResp = await cs.RociPayment.connect(user2).claimCollateral(
      cs.TestETH.address,
      afterPayment,
      ROCI_PAYMENT_VERSION
    );
    const txReceipt = await txResp.wait();
    expect(txReceipt.gasUsed.toNumber()).to.be.lt(500_000);
  });

  it("Get withdrawable collateral for multiple loans with same LT", async () => {
    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, 2000);
    await quickdeposit(cs, user1, await toTokenWei(100_000, cs.TestUSDC));

    // 1 Borrow
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 1000);

    // 2 Borrow
    const collateral2 = await quickBorrowWithPreciseCollaterall(
      cs,
      user2,
      3,
      cs.TestETH,
      2000
    );

    await expect(
      cs.RociPayment.connect(user2).claimCollateral(
        cs.TestETH.address,
        toWei(collateral2),
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_CLAIM_COLLATERAL);

    const beforePayment = await cs.RociPayment.connect(
      user2
    ).getMaxWithdrawableCollateral();

    mine(7 * 24 * 60 * 60);
    await collectAllLoans(cs, user2.address, cs.Investor);

    const afterCollection = await cs.RociPayment.connect(
      user2
    ).getMaxWithdrawableCollateral();
    expect(afterCollection.lt(beforePayment)).to.be.true;

    const loans = await getAllLoans(cs, user2.address);
    await quickPayment(cs, user2, 500, loans[0].loanId);
    const afterPayment = await cs.RociPayment.connect(
      user2
    ).getMaxWithdrawableCollateral();

    await expect(
      cs.RociPayment.connect(user2).claimCollateral(
        cs.TestETH.address,
        afterPayment.mul(toWei(1.01)),
        ROCI_PAYMENT_VERSION
      )
    ).be.be.revertedWith(errors.PAYMENT_CLAIM_COLLATERAL);

    await cs.RociPayment.connect(user2).claimCollateral(
      cs.TestETH.address,
      afterPayment,
      ROCI_PAYMENT_VERSION
    );
    await collectAllLoans(cs, user2.address, cs.Investor);

    expect(
      await cs.RociPayment.connect(user2)
        .getMaxWithdrawableCollateral()
        .then(fromWeiNumber)
    ).to.equal(0);

    expect(
      await getAllLoans(cs, user2.address).then((loans) =>
        loans.every(
          ({ status }) => status === "PAIDPART" || status === "APPROVED"
        )
      )
    ).to.be.true;
  });

  it("Loans will become delinquent and getMaxWithdrawableCollateral will return 0", async () => {
    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, 2000);
    await quickdeposit(
      cs,
      user1,
      await toTokenWei(100_000, cs.TestUSDC),
      "InvestorRuSDC3"
    );

    // 1 Borrow
    await quickBorrowWithPreciseCollaterall(
      cs,
      user2,
      10,
      cs.TestETH,
      1000,
      undefined,
      "InvestorRuSDC3"
    );
    // 2 Borrow
    await quickBorrowWithPreciseCollaterall(
      cs,
      user2,
      10,
      cs.TestETH,
      2000,
      undefined,
      "InvestorRuSDC3"
    );

    mine(7 * 24 * 60 * 60);
    // Drastic price drop
    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, 1000);

    const loans = await getAllLoans(cs, user2.address);

    expect(await cs.RociPayment.isDelinquent(loans[0].loanId)).to.equal(true);
    expect(await cs.RociPayment.isDelinquent(loans[1].loanId)).to.equal(true);
    expect(
      await cs.RociPayment.connect(user2)
        .getMaxWithdrawableCollateral()
        .then((r) => r.isZero())
    ).to.equal(true);
    await expect(
      cs.RociPayment.connect(user2).claimCollateral(
        cs.TestETH.address,
        toWei("0.000000001"),
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_CLAIM_COLLATERAL);
  });

  it("Get withdrawable collateral for multiple loans with different LT but same score", async () => {
    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, 2000);
    await quickdeposit(
      cs,
      user1,
      await toTokenWei(100_000, cs.TestUSDC),
      "InvestorRuSDC3"
    );

    // 1 Borrow
    await quickBorrowWithPreciseCollaterall(
      cs,
      user2,
      10,
      cs.TestETH,
      1000,
      undefined,
      "InvestorRuSDC3"
    );

    const beforeSecondBorrow = await cs.RociPayment.connect(
      user2
    ).getMaxWithdrawableCollateral();

    // 2 Borrow
    await quickBorrowWithPreciseCollaterall(
      cs,
      user2,
      10,
      cs.TestETH,
      2000,
      undefined,
      "InvestorRuSDC3"
    );

    const afterSecondBorrow = await cs.RociPayment.connect(
      user2
    ).getMaxWithdrawableCollateral();

    const loans = await getAllLoans(cs, user2.address);
    await quickPayment(cs, user2, 2000, loans[1].loanId, "InvestorRuSDC3");

    const afterPayment = await cs.RociPayment.connect(
      user2
    ).getMaxWithdrawableCollateral();

    await cs.RociPayment.connect(user2).claimCollateral(
      cs.TestETH.address,
      afterPayment.sub(beforeSecondBorrow),
      ROCI_PAYMENT_VERSION
    );
    const afterClaim = await cs.RociPayment.connect(
      user2
    ).getMaxWithdrawableCollateral();

    expect(afterClaim.eq(beforeSecondBorrow)).to.be.true;

    await cs.ScoreDB.connect(owner).setConfig(
      [cs.TestUSDC.address],
      [10],
      [toWei(80)],
      [toWei(90)]
    );

    await quickBorrowWithPreciseCollaterall(
      cs,
      user2,
      10,
      cs.TestETH,
      2000,
      undefined,
      "InvestorRuSDC3"
    );

    const afterLTVChange = await cs.RociPayment.connect(
      user2
    ).getMaxWithdrawableCollateral();

    expect(afterLTVChange.gt(afterSecondBorrow)).to.be.true;
  });

  it("getMaxWithdrawableCollateral ultimate check", async () => {
    await quickdeposit(
      cs,
      user1,
      await toTokenWei(100_000, cs.TestUSDC),
      "InvestorRuSDC1"
    );
    await quickdeposit(
      cs,
      user1,
      await toTokenWei(100_000, cs.TestUSDC),
      "InvestorRuSDC2"
    );
    await quickdeposit(
      cs,
      user1,
      await toTokenWei(100_000, cs.TestUSDC),
      "InvestorRuSDC3"
    );
    const maxPercantageOverflow = [];
    for (const score of Object.keys(NFCS_SCORE_TO_USDC_LTV)) {
      generateOrUpdateScore(user2, Number(score), cs);
      const investorType = getInvestorTypeByScore(Number(score));
      await quickBorrowWithPreciseCollaterall(
        cs,
        user2,
        Number(score),
        cs.TestETH,
        100,
        undefined,
        investorType
      );
      const collateralAmount = await cs.RociPayment.connect(
        user2
      ).getMaxWithdrawableCollateral();

      let beforeClaim = await snapshot();

      for (let i = 1; i <= 100; i++) {
        await revert(beforeClaim);
        beforeClaim = await snapshot();

        const extraCollateral = collateralAmount.mul(i).div("100");

        try {
          await cs.RociPayment.connect(user2).claimCollateral(
            cs.WETH.address,
            collateralAmount.add(extraCollateral),
            ROCI_PAYMENT_VERSION
          );

          expect(await cs.WETH.balanceOf(user2.address)).equal(
            collateralAmount.add(extraCollateral)
          );
        } catch {
          maxPercantageOverflow.push(i - 1);
          break;
        }
      }
      const loanId = await getLastLoanId(cs.RociPayment, user2.address);
      await quickPayment(cs, user2, 100, loanId, investorType);
    }
    expect(maxPercantageOverflow.every((item) => item === 0)).to.be.true;
  });

  it("Send profit to shares", async () => {
    const share1 = 2,
      share2 = 8,
      share3 = 90;

    await cs.RevenueManager.addShares(
      [user3.address, user4.address, cs.RevenueManager.address],
      [share1, share2, share3]
    );

    expect(await cs.TestUSDC.balanceOf(user3.address)).to.equal(0);
    expect(await cs.TestUSDC.balanceOf(user4.address)).to.equal(0);

    expect(await cs.RevenueManager.getSharesLength()).to.equal(3);
    expect(await cs.RevenueManager.totalShares()).to.be.equal(
      share1 + share2 + share3
    );

    await cs.Investor.setInterestRateAnnual(toWei("12.0"));
    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, 2000);

    await quickdeposit(cs, user1, await toTokenWei(100_000, cs.TestUSDC));
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 1000);
    await quickBorrowWithPreciseCollaterall(cs, user2, 3, cs.TestETH, 2000);

    const loans = await getAllLoans(cs, user2.address);

    await mine(24 * 60 * 60);

    const balanceBeforePayment = await cs.RevenueManager.balanceAvailable(
      cs.Investor.address
    );
    await cs.Investor.collect([loans[0].loanId], VERSION);
    const balanceAfterCollect = await cs.RevenueManager.balanceAvailable(
      cs.Investor.address
    );
    expect(balanceAfterCollect.eq(balanceBeforePayment)).to.be.true;

    await quickPayment(cs, user2, 200, loans[0].loanId);
    const balanceAfterPayment = await cs.RevenueManager.balanceAvailable(
      cs.Investor.address
    );
    const dif = balanceAfterPayment.sub(balanceAfterCollect);
    const repaidAmount = await toTokenWei(200, cs.TestUSDC);
    // RevenueManager received less than user paid, since certain part goes to shares
    expect(dif).to.be.lt(repaidAmount);
    // user3 and user3 received their shares part
    const user3Share = await cs.TestUSDC.balanceOf(user3.address);
    const user4Share = await cs.TestUSDC.balanceOf(user4.address);

    // check that payees received right amount of shares
    expect(user4Share.div(user3Share)).to.be.equal(share2 / share1);

    // simulate multiple collects
    await mine(24 * 60 * 60);
    await cs.Investor.collect([loans[0].loanId], VERSION);
    await mine(24 * 60 * 60);
    await cs.Investor.collect([loans[0].loanId], VERSION);
    await mine(24 * 60 * 60);
    await cs.Investor.collect([loans[0].loanId], VERSION);

    // simulate multiple payments and collects
    await mine(24 * 60 * 60);
    await cs.Investor.collect([loans[0].loanId], VERSION);
    await quickPayment(cs, user2, 20, loans[0].loanId);
    await mine(24 * 60 * 60);
    await cs.Investor.collect([loans[0].loanId], VERSION);
    await quickPayment(cs, user2, 20, loans[0].loanId);

    const { totalPaymentsValue, paymentComplete } =
      await cs.RociPayment.loanLookup(loans[0].loanId);

    await quickPayment(
      cs,
      user2,
      await fromTokenWei(totalPaymentsValue.sub(paymentComplete), cs.TestUSDC),
      loans[0].loanId
    );

    const wholeInterest = await cs.RociPayment.loanLookup(loans[0].loanId).then(
      ({ totalPaymentsValue, principal }) => totalPaymentsValue.sub(principal)
    );

    // the end result can be calculated from amount of shares and the whole interest
    // due to rounding result is strictly equal or differs only by 1 wei
    expect(
      await cs.TestUSDC.balanceOf(user3.address).then((r) =>
        r.sub(wholeInterest.mul(share1).div(share1 + share2 + share3))
      )
    ).to.be.lte(ethers.utils.parseUnits("1", "wei"));
    expect(
      await cs.TestUSDC.balanceOf(user4.address).then((r) =>
        r.sub(wholeInterest.mul(share2).div(share1 + share2 + share3))
      )
    ).to.be.lte(ethers.utils.parseUnits("1", "wei"));
  });
});
