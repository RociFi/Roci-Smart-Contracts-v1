const fs = require("fs");
const path = require("path");
const { ethers, upgrades } = require("hardhat");
const { BigNumber } = require("ethers");
const { expect } = require("chai");
const hre = require("hardhat");
const { forkingNetwork } = require("../hardhat.config");
const axios = require("axios").default;

const {
  USDC_ADDRESS,
  ROCI_ADDRESS,
  WETH_ADDRESS,
  MAXIMUM_DAILY_LIMIT,
  MAXIMUM_GLOBAL_LIMIT,
  MAXIMUM_USER_DAILY_LIMIT,
  MAXIMUM_USER_GLOBAL_LIMIT,
  WETH_USDC_PF,
  LT,
  LTV,
  GAS_STATION_URL,
  RICH_USDC,
  RICH_WETH,
  USDC_USD_PF,
  LOAN_DURATION,
  SCORE_VALIDITY_PERIOD,
  MIN_SCORE,
  MAX_SCORE,
  NOT_GENERATED,
  GENERATION_ERROR,
  PENALTY_APY_MULTIPLIER,
  GRACE_PERIOD,
  ONE_HUNDRED_PERCENT_WEI,
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
  ROLE_LIQUIDATOR,
  ROLE_COLLECTOR,
} = require("../scripts/constants");

const {
  chainConfig,
} = require("@nomiclabs/hardhat-etherscan/dist/src/ChainConfig");
const {
  buildContractUrl,
} = require("@nomiclabs/hardhat-etherscan/dist/src/util");
const {
  VERSION,
  NFCS_SCORE_TO_USDC_LTV,
  LOAN_STATUSES,
  ROCI_PAYMENT_VERSION,
} = require("./constants");
const POOL_INVESTORS = require("../scripts/config/poolInvestors");

async function getLastLoanId(paymentc, address) {
  const index =
    parseInt((await paymentc.getNumberOfLoans(address)).toString()) - 1;
  if (index < 0) {
    return null;
  }
  let loanId = (await paymentc.loanIDs(address, index)).toString();
  return loanId;
}

async function getAllLoans(cs, userAddress) {
  const loanLength = parseInt(
    (await cs.RociPayment.getNumberOfLoans(userAddress)).toString()
  );
  if (loanLength === 0) {
    return [];
  }
  return Promise.all(
    Array.from(Array(loanLength)).map((_, index) =>
      cs.RociPayment.loanIDs(userAddress, index).then((loanId) =>
        cs.RociPayment.loanLookup(loanId.toString()).then(
          ({
            status,
            interestRate,
            accrualPeriod,
            principal,
            totalPaymentsValue,
            awaitingCollection,
            paymentComplete,
            ltv,
            lt,
            poolAddress,
          }) => ({
            status: LOAN_STATUSES[status],
            loanId: loanId.toString(),
            ltv: fromWeiInt(ltv),
            lt: fromWeiInt(lt),
            interestRate: fromWei(interestRate),
            accrualPeriod: fromWei(accrualPeriod),
            principal: fromWeiToDollars(principal),
            totalPaymentsValue: fromWeiToDollars(totalPaymentsValue),
            awaitingCollection: fromWeiToDollars(awaitingCollection),
            paymentComplete: fromWeiToDollars(paymentComplete),
            poolAddress,
          })
        )
      )
    )
  );
}

// Liquidator calls loanLookup, calculates expectedCollateralAmount
// expectedCollateralAmount = (Loan.totalPaymentsValue - Loan.paymentComplete) / ETH_PRICE_IN_USDC
async function calculateExpectedCollateralAmountFromLiquidation(
  cs,
  loanId,
  collateralPrice,
  normalizerCoefficient
) {
  return cs.RociPayment.loanLookup(loanId).then(
    ({ totalPaymentsValue, paymentComplete }) =>
      totalPaymentsValue
        .sub(paymentComplete)
        .div(collateralPrice)
        .mul(normalizerCoefficient)
  );
}

async function sumBigNumbers(bigNumbersArray) {
  return bigNumbersArray.reduce((sum, l) => sum.add(l), BigNumber.from(0));
}

async function collectAllLoans(cs, userAddress, investor) {
  return getAllLoans(cs, userAddress).then((res) =>
    investor.collect(
      res.map((loan) => loan.loanId),
      VERSION
    )
  );
}

async function sleep(months) {
  return mine(2629743 * months);
}

async function setAutoMine(is) {
  return ethers.provider.send("evm_setAutomine", [is]);
}

async function mine(sleepDuration) {
  if (sleepDuration) {
    await ethers.provider.send("evm_increaseTime", [sleepDuration]);
  }

  return ethers.provider.send("evm_mine");
}

function toWei(number) {
  return ethers.utils.parseUnits(number.toString(), 18);
}

async function toTokenWei(amount, token) {
  return ethers.utils.parseUnits(
    amount.toString().split(" ").join(""),
    await token.decimals()
  );
}

async function fromTokenWei(amount, token) {
  return ethers.utils.formatUnits(amount.toString(), await token.decimals());
}

function fromWei(number) {
  return ethers.utils.formatUnits(number.toString(), 18);
}

function fromWeiNumber(number) {
  return Number(fromWei(number));
}

function fromWeiToDollars(number) {
  return Number(ethers.utils.formatUnits(number.toString(), 6));
}

function fromWeiInt(number) {
  return parseInt(fromWei(number));
}

async function getLastBlockTimestamp() {
  const blockNumber = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNumber);
  return block.timestamp;
}

async function borrow(
  paymentc,
  investor,
  user,
  amount,
  NFCSID,
  collateralAmount,
  collateralContract,
  usdContract,
  eventCollector
) {
  const numberOfLoans = (
    await paymentc.getNumberOfLoans(user.address)
  ).toString();

  let loanId = (await paymentc.getId(user.address, numberOfLoans)).toString();

  const hash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["address", "uint256"],
      [paymentc.address, loanId]
    )
  );
  let signature = await user.signMessage(ethers.utils.arrayify(hash));

  if (!(amount instanceof BigNumber)) {
    amount = await toTokenWei(amount, usdContract);
  }

  if (!(collateralAmount instanceof BigNumber)) {
    collateralAmount = await toTokenWei(collateralAmount, collateralContract);
  }

  const tx = await investor.connect(user).borrow(
    {
      _amount: amount,
      _NFCSID: NFCSID,
      _collateralAmount: collateralAmount,
      _collateral: collateralContract.address,
      _hash: hash,
      _signature: signature,
    },
    VERSION
  );
  if (eventCollector !== undefined) {
    (await tx.wait()).events.forEach((event) => {
      eventCollector.push(event);
    });
  }
  //ethers call return result is prevented to extend, need to use copy
  let loan = Object.assign({ id: loanId }, await paymentc.loanLookup(loanId));
  return loan;
}

async function deposit({ pool, token, user, amount }) {
  if (typeof amount === "string") {
    amount = await toTokenWei(amount.toString(), token);
  }

  await token.connect(user).approve(pool.address, amount);

  await pool.connect(user).depositPool(amount, VERSION);
}

async function setupAMM(TestToken, TestDebtToken, TestETH) {
  const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

  let [owner] = await ethers.getSigners();

  const UniswapRouter = await ethers.getContractAt(
    "IUniswapV2Router02",
    UNISWAP_ROUTER_ADDRESS
  );

  const liquidityAmount = ethers.utils.parseUnits("2000.0", 18);
  await TestToken.connect(owner).approve(
    UniswapRouter.address,
    liquidityAmount
  );
  await TestDebtToken.connect(owner).approve(
    UniswapRouter.address,
    liquidityAmount
  );

  await UniswapRouter.addLiquidity(
    TestToken.address,
    TestDebtToken.address,
    liquidityAmount,
    liquidityAmount,
    0,
    0,
    owner.address,
    (await getLastBlockTimestamp()) + 30
  );

  const liquidityAmount1 = ethers.utils.parseUnits("1", 18);
  const liquidityAmount2 = ethers.utils.parseUnits("3700", 18);

  await TestETH.connect(owner).approve(UniswapRouter.address, liquidityAmount1);

  await TestToken.connect(owner).approve(
    UniswapRouter.address,
    liquidityAmount2
  );

  await UniswapRouter.addLiquidity(
    TestETH.address,
    TestToken.address,
    liquidityAmount1,
    liquidityAmount2,
    0,
    0,
    owner.address,
    (await getLastBlockTimestamp()) + 30
  );
}

function getPercent(amount) {
  amount = BigNumber.from(amount);

  return amount.div("100");
}

function addPercent(amount, percents) {
  percents = BigNumber.from(percents);

  return amount.add(getPercent(amount).mul(percents));
}

function subPercent(amount, percents) {
  percents = BigNumber.from(percents);

  return amount.sub(getPercent(amount).mul(percents));
}

function inPercentRange(expected, actual, percent) {
  const lowerLimit = subPercent(actual, percent);
  const higherLimit = addPercent(actual, percent);

  return expected.gt(lowerLimit) && expected.lt(higherLimit);
}

async function calculateDepositReward(
  PiDisclosurer,
  account,
  timestamp,
  balance,
  stakeTimestamp
) {
  let currentBlockTimestamp;
  let balaceOfUser;
  let stakeTimes;

  if (timestamp === undefined) {
    currentBlockTimestamp = BigNumber.from(
      (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))
        .timestamp
    );
  } else {
    currentBlockTimestamp = BigNumber.from(timestamp);
  }

  if (balance === undefined) {
    balaceOfUser = await PiDisclosurer.balanceOf(account);
  } else {
    balaceOfUser = balance;
  }

  if (stakeTimestamp === undefined) {
    stakeTimes = await PiDisclosurer.stakeTimes(account);
  } else {
    stakeTimes = stakeTimestamp;
  }

  const SPY = await PiDisclosurer.getSPY();
  const oneHundredPercents = toWei(100.0);
  return currentBlockTimestamp
    .sub(stakeTimes)
    .mul(balaceOfUser.mul(SPY))
    .div(oneHundredPercents);
}

function loadAbi(fileName) {
  fileName = path.join("abi", fileName);

  const raw = fs.readFileSync(fileName, "utf-8");

  return JSON.parse(raw);
}

function assertEquals(a, b) {
  if (a !== b) {
    throw new Error(`${a} is not equal to ${b}`);
  }
}

async function localDeployV3(isMainnetForkTest) {
  let isTestnet = true; //Actually is testnet or local testing but not mainnet fork testing
  let usdcContract, wethContract;
  let [owner, pauser] = await ethers.getSigners();

  if (isMainnetForkTest !== undefined) {
    isTestnet = !isMainnetForkTest;
  }

  await mine();

  if (!isTestnet) {
    //Steal some tokens from rich accounts
    usdcContract = loadContract(USDC_ADDRESS, "MaticUSDC.json");
    wethContract = loadContract(WETH_ADDRESS, "MaticUSDC.json");

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [RICH_USDC],
    });

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [RICH_WETH],
    });

    const richUSDC = await ethers.getSigner(RICH_USDC);
    const richWETH = await ethers.getSigner(RICH_WETH);

    const usdcToUse = (await usdcContract.balanceOf(richUSDC.address)).div("2");
    const wethToUse = (await wethContract.balanceOf(richWETH.address)).div("2");

    let tx = await usdcContract
      .connect(richUSDC)
      .transfer(owner.address, usdcToUse);
    await tx.wait();

    tx = await wethContract
      .connect(richWETH)
      .transfer(owner.address, wethToUse);
    await tx.wait();
  }

  const factories = await getFactories(owner, isTestnet);

  const contracts = {};

  contracts.AddressBook = await upgrades.deployProxy(
    factories.AddressBookFactory
  );

  contracts.NFCS = await upgrades.deployProxy(
    factories.NFCSFactory,
    [contracts.AddressBook.address],
    {
      initializer: "initialize",
      kind: "uups",
    }
  );
  contracts.Bonds = await factories.BondsFactory.deploy();

  contracts.ScoreDB = await factories.ScoreDBFactory.deploy(
    contracts.AddressBook.address
  );

  contracts.PriceFeed = await factories.PriceFeedFactory.deploy();

  contracts.CollateralManager = await factories.CollateralManagerFactory.deploy(
    contracts.AddressBook.address
  );

  contracts.RevenueManager = await factories.RevenueManagerFactory.deploy(
    contracts.AddressBook.address
  );

  let usdcAddress;

  if (isTestnet) {
    contracts.TestUSDC = await factories.TokenFactory.deploy(
      "Test USDC",
      "USDC",
      6
    );

    contracts.TestETH = await factories.TokenFactory.deploy("WETH", "WETH", 18);

    usdcAddress = contracts.TestUSDC.address;
  } else {
    usdcAddress = USDC_ADDRESS;

    contracts.TestUSDC = usdcContract;
    contracts.TestETH = wethContract;
  }

  contracts.RociPayment = await factories.RociPaymentFactory.deploy(
    contracts.AddressBook.address
  );

  await contracts.AddressBook.setAddressToRole(ROLE_TOKEN, usdcAddress);

  await contracts.AddressBook.setAddressToRole(
    ROLE_BONDS,
    contracts.Bonds.address
  );

  await contracts.AddressBook.setAddressToRole(
    ROLE_PAYMENT_CONTRACT,
    contracts.RociPayment.address
  );

  await contracts.AddressBook.setAddressToRole(
    ROLE_REV_MANAGER,
    contracts.RevenueManager.address
  );

  await contracts.AddressBook.setAddressToRole(
    ROLE_NFCS,
    contracts.NFCS.address
  );

  await contracts.AddressBook.setAddressToRole(
    ROLE_COLLATERAL_MANAGER,
    contracts.CollateralManager.address
  );

  await contracts.AddressBook.setAddressToRole(
    ROLE_PRICE_FEED,
    contracts.PriceFeed.address
  );

  await contracts.AddressBook.setAddressToRole(
    ROLE_ORACLE,
    contracts.ScoreDB.address
  );

  await contracts.AddressBook.setAddressToRole(ROLE_ADMIN, owner.address);
  await contracts.AddressBook.setAddressToRole(ROLE_PAUSER, pauser.address);
  await contracts.AddressBook.setAddressToRole(ROLE_LIQUIDATOR, owner.address);
  await contracts.AddressBook.setAddressToRole(ROLE_COLLECTOR, owner.address);

  contracts.InvestorRuSDC1 = await factories.InvestorFactory.deploy(
    contracts.AddressBook.address,
    usdcAddress,
    0x72,
    0x31
  );

  contracts.InvestorRuSDC2 = await factories.InvestorFactory.deploy(
    contracts.AddressBook.address,
    usdcAddress,
    0x72,
    0x32
  );

  contracts.InvestorRuSDC3 = await factories.InvestorFactory.deploy(
    contracts.AddressBook.address,
    usdcAddress,
    0x72,
    0x33
  );

  return contracts;
}

async function configureAfterDeploy(contracts, isForkOrTestnet, deployer) {
  let tx;
  let owner;

  if (deployer !== undefined) {
    owner = deployer;
  } else {
    [owner] = await ethers.getSigners();
  }

  const isTesting = !(hre.network.name == "hardhat");

  updateLLL("Setting up ROCI_ADDRESS for ScoreDB", isTesting);

  tx = await contracts.ScoreDB.setRociAddress(ROCI_ADDRESS);

  await tx.wait();

  let usdcAddress;
  let wethAddress;

  if (isForkOrTestnet) {
    usdcAddress = contracts.TestUSDC.address;
    wethAddress = contracts.TestETH.address;
  } else {
    usdcAddress = USDC_ADDRESS;
    wethAddress = WETH_ADDRESS;
  }

  // TODO for some reason Investors may be configured with admin != deployer. This can be fixed by running await AddressBook.replaceCategoryAddress("NewDeploy", ..., adminAddress), but we need a better solution

  await configureContractsV3(contracts, usdcAddress, owner, isTesting);

  updateLLL("Adding accepted collateral..", isTesting);
  tx = await contracts.CollateralManager.connect(owner).addAcceptedDeposits([
    wethAddress,
  ]);
  await tx.wait();

  updateLLL("Adding Investors to RevenueManager..", isTesting);
  tx = await contracts.RevenueManager.connect(owner).addAcceptedDeposits([
    contracts.InvestorRuSDC1.address,
  ]);
  await tx.wait();

  if (contracts.InvestorRuSDC2 !== undefined) {
    tx = await contracts.RevenueManager.connect(owner).addAcceptedDeposits([
      contracts.InvestorRuSDC2.address,
    ]);
    await tx.wait();
  }

  if (contracts.InvestorRuSDC3 !== undefined) {
    tx = await contracts.RevenueManager.connect(owner).addAcceptedDeposits([
      contracts.InvestorRuSDC3.address,
    ]);
    await tx.wait();
  }

  updateLLL("Configuring an AddressBook parameters..", isTesting);

  await contracts.AddressBook.setLoanDuration(BigNumber.from(LOAN_DURATION));

  updateLLL("SCORE_VALIDITY_PERIOD", isTesting);

  await contracts.AddressBook.setScoreValidityPeriod(
    BigNumber.from(SCORE_VALIDITY_PERIOD)
  );

  updateLLL("MIN_SCORE", isTesting);

  tx = await contracts.AddressBook.setMinScore(MIN_SCORE);
  await tx.wait();

  updateLLL("MIN_SCORE", isTesting);

  tx = await contracts.AddressBook.setMaxScore(MAX_SCORE);
  await tx.wait();

  updateLLL("NOT_GENERATED", isTesting);

  tx = await contracts.AddressBook.setNotGenerated(NOT_GENERATED);
  await tx.wait();

  updateLLL("GENERATION_ERROR", isTesting);

  tx = await contracts.AddressBook.setGenerationError(GENERATION_ERROR);
  await tx.wait();

  updateLLL("PENALTY_APY_MULTIPLIER", isTesting);

  tx = await contracts.AddressBook.setPenaltyAPYMultiplier(
    PENALTY_APY_MULTIPLIER
  );
  await tx.wait();

  updateLLL("GRACE_PERIOD", isTesting);

  tx = await contracts.AddressBook.setGracePeriod(GRACE_PERIOD);
  await tx.wait();

  updateLLL("MAXIMUM_DAILY_LIMIT", isTesting);

  tx = await contracts.AddressBook.setDailyLimit(MAXIMUM_DAILY_LIMIT);
  await tx.wait();

  updateLLL("MAXIMUM_GLOBAL_LIMIT", isTesting);

  tx = await contracts.AddressBook.setGlobalLimit(MAXIMUM_GLOBAL_LIMIT);
  await tx.wait();

  updateLLL("MAXIMUM_USER_DAILY_LIMIT", isTesting);

  tx = await contracts.AddressBook.setUserDailyLimit(MAXIMUM_USER_DAILY_LIMIT);
  await tx.wait();

  updateLLL("MAXIMUM_USER_GLOBAL_LIMIT", isTesting);

  tx = await contracts.AddressBook.setUserGlobalLimit(
    MAXIMUM_USER_GLOBAL_LIMIT
  );
  await tx.wait();

  updateLLL("Adding price feeder WETH_ADDRESS..", isTesting);

  tx = await contracts.PriceFeed.addPriceFeed(WETH_ADDRESS, WETH_USDC_PF);
  await tx.wait();

  updateLLL("Adding price feeder USDC_ADDRESS..", isTesting);

  tx = await contracts.PriceFeed.addPriceFeed(USDC_ADDRESS, USDC_USD_PF);
  await tx.wait();
}

async function configureForFork(contracts) {
  let tx;

  let [owner, user1, user2, user3] = await ethers.getSigners();

  //Attach to existing contracts
  const usdcContract = loadContract(USDC_ADDRESS, "MaticUSDC.json");
  const wethContract = loadContract(WETH_ADDRESS, "MaticUSDC.json");

  const tokenAmount = await toTokenWei("1000", usdcContract);

  console.log("Transfering tokens to users and RevManager..");
  for (let user of [user1, user2, user3]) {
    tx = await wethContract.connect(owner).transfer(user.address, tokenAmount);
    await tx.wait();
  }

  await tx.wait();

  //Checking bonds uri
  const uri = await contracts.Bonds.uri(0);
  expect(uri).to.be.a("string");
}

async function configureForTests(contracts, onChain) {
  let tx;

  updateLLL("Checking Bonds.uri(0) is a string", onChain);
  const uri = await contracts.Bonds.uri(0);
  expect(uri).to.be.a("string");

  updateLLL("Setting price for USDC, wETH..", onChain);
  tx = await contracts.PriceFeed.setPriceForToken(
    contracts.TestUSDC.address,
    1.0
  );
  await tx.wait();

  tx = await contracts.PriceFeed.setPriceForToken(
    contracts.TestETH.address,
    3700.0
  );
  await tx.wait();
}

async function attachContractsV3(isForkOrTestnet, deployer, artifactDir) {
  let owner;

  if (deployer !== undefined) {
    owner = deployer;
  } else {
    [owner] = await ethers.getSigners();
  }

  isForkOrTestnet ? console.log("Getting Factories..") : null;

  // let report = getRecentlyDeployed(artifactDir);

  // if (!report) {
  //   throw new Error("Unable to read report and get contract addresses");
  // }

  const factories = await getFactories(owner, isForkOrTestnet);

  let instances = {};

  let m = new Map([
    [
      "AddressBook",
      (contract) => factories.AddressBookFactory.attach(contract.proxy),
    ],
    ["TestETH", (contract) => factories.TokenFactory.attach(contract.address)],
    ["TestUSDC", (contract) => factories.TokenFactory.attach(contract.address)],
    ["Bonds", (contract) => factories.BondsFactory.attach(contract.address)],
    [
      "ScoreDB",
      (contract) => factories.ScoreDBFactory.attach(contract.address),
    ],
    ["NFCS", (contract) => factories.NFCSFactory.attach(contract.proxy)],
    [
      "RevenueManager",
      (contract) => factories.RevenueManagerFactory.attach(contract.address),
    ],
    [
      "CollateralManager",
      (contract) => factories.CollateralManagerFactory.attach(contract.address),
    ],
    [
      "RociPayment",
      (contract) => factories.RociPaymentFactory.attach(contract.address),
    ],
    [
      "PriceFeed",
      (contract) => factories.PriceFeedFactory.attach(contract.address),
    ],
    [
      "InvestorRuSDC1",
      (contract) => factories.InvestorFactory.attach(contract.address),
    ],
    [
      "InvestorRuSDC2",
      (contract) => factories.InvestorFactory.attach(contract.address),
    ],
    [
      "InvestorRuSDC3",
      (contract) => factories.InvestorFactory.attach(contract.address),
    ],
  ]);

  updateLLL("Attaching is done!", isForkOrTestnet);

  return instances;
}

const checkIsFork = () => {
  let isForkingEnabled;

  try {
    isForkingEnabled = hre.network.config.forking.enabled;
  } catch (e) {
    if (e instanceof TypeError) {
      isForkingEnabled = false;
    }
  }

  return isForkingEnabled;
};

const getRecentlyDeployed = (dir, fileDir) => {
  const filePrefix = checkIsFork() ? forkingNetwork : hre.network.name;

  let fileNames = fs.readdirSync(dir);

  if (process.env.DEPLOY_LOG) {
    fileNames = fileNames.filter(
      (fileName) =>
        fs.lstatSync(path.join(dir, fileName)).isFile() &&
        fileName === process.env.DEPLOY_LOG
    );

    if (fileNames.length === 0) {
      console.log(
        "Deploy log file '" +
          process.env.DEPLOY_LOG +
          "' from env(DEPLOY_LOG) not found"
      );
    }
  } else {
    fileNames = fileNames.filter(
      (file) =>
        fs.lstatSync(path.join(dir, file)).isFile() &&
        file.startsWith(filePrefix)
    );
  }

  fileNames = fileNames
    .map((fileName) => {
      const dotIdx = fileName.lastIndexOf(".");
      const dateStartIdx = dotIdx - 16;

      // Extracting date part from file name up to last dot
      const dateStr = fileName.slice(dateStartIdx, dotIdx);

      // Converting date string to Unix timestamp
      const unixTime = new Date(dateStr).getTime();

      return { file: fileName, time: unixTime };
    })
    .sort((a, b) => b.time - a.time);

  if (fileNames.length === 0) {
    return false;
  }

  const filePath = path.resolve(dir, fileNames[0].file);

  if (fileDir !== undefined) {
    fileDir.path = filePath;
  }

  const artifact = JSON.parse(fs.readFileSync(filePath));

  if (!artifact.state.finished) {
    console.log("Working with deployment file: " + fileNames.file);
  }

  return artifact;
};

const configureContractsV3 = async (
  contracts,
  usdcAddress,
  owner,
  isForkOrTestnet
) => {
  let tx;

  updateLLL("Updating scodeDB configs: LTV, LT..", isForkOrTestnet);

  for (let score = 1; score <= LTV.length; score++) {
    tx = await contracts.ScoreDB.connect(owner).setConfig(
      [usdcAddress],
      [score],
      [toWei(LTV[score - 1])],
      [toWei(LT[score - 1])]
    );

    updateLLL(
      `Updating scodeDB configs: LTV, LT ${score}/${LTV.length}, tx: ${tx.hash}`,
      isForkOrTestnet
    );

    await tx.wait();
  }

  updateLLL(`ScoreDB update tx: ${tx.hash}`, isForkOrTestnet);

  await tx.wait();

  const poolInvestors = Object.entries(POOL_INVESTORS);

  for (const [investorType, { APR, allowedScores }] of poolInvestors) {
    tx = await contracts[investorType]
      .connect(owner)
      .setInterestRateAnnual(toWei(APR));

    updateLLL(
      `Updating investors APR ${investorType}: ${tx.hash}`,
      isForkOrTestnet
    );

    await tx.wait();

    tx = await contracts[investorType]
      .connect(owner)
      .setAllowedScores(allowedScores);

    updateLLL(
      `Updating investors allowed scores ${investorType}: ${tx.hash}`,
      isForkOrTestnet
    );

    await tx.wait();
  }
};

//Last Log Line override
const updateLLL = (message, onChain) => {
  if (onChain) {
    process.stdout.moveCursor(0, -1);
    process.stdout.clearLine(1);
    console.log(message);
  }
};

const setTokenBalanceFor = async (token, user, amount) => {
  let userBalance = await token.balanceOf(user.address);
  if (typeof amount === "string") {
    amount = await toTokenWei(amount, token);
  }
  userBalance.gt(amount)
    ? await token.connect(user).burn(userBalance.sub(amount))
    : await token.mint(user.address, amount.sub(userBalance));
};

const setTokenBalanceForFork = async (token, user, amount, moneyBag) => {
  if (typeof amount === "string") {
    amount = await toTokenWei(amount, token);
  }

  let userBalance = await token.balanceOf(user.address);

  if (userBalance.gt(amount)) {
    await token
      .connect(user)
      .transfer(moneyBag.address, userBalance.sub(amount));
  } else {
    await token
      .connect(moneyBag)
      .transfer(user.address, amount.sub(userBalance));
  }
};

async function mint(nfcs, account) {
  let bundle = [];
  let signatures = [];
  let messageHash = ethers.utils.solidityKeccak256(
    ["string", "uint256"],
    ["TEST", 1]
  );
  bundle.push(account.address);
  let sig = await account.signMessage(ethers.utils.arrayify(messageHash));
  signatures.push(sig);
  await nfcs.connect(account).mintToken(bundle, signatures, "TEST", 1, VERSION);

  return Number(await nfcs.getToken(account.address));
}

async function updateScore(ScoreDB, NFCSID, score, account) {
  const blockNumBefore = await ethers.provider.getBlockNumber();
  const blockBefore = await ethers.provider.getBlock(blockNumBefore);
  const timestamp = blockBefore.timestamp;

  let scoreObj = {
    id: NFCSID,
    creditScore: score,
    timestamp: timestamp,
  };

  let objectHash = ethers.utils.solidityKeccak256(
    ["uint256", "uint16", "uint256"],
    [scoreObj.id, scoreObj.creditScore, scoreObj.timestamp]
  );

  const sig = await account.signMessage(ethers.utils.arrayify(objectHash));
  const oldRociAddress = await ScoreDB.ROCI_ADDRESS();

  await ScoreDB.setRociAddress(account.address);

  await ScoreDB.updateScore(NFCSID, score, timestamp, sig);

  await ScoreDB.setRociAddress(oldRociAddress);
}

async function getFactories(owner, isForkOrTestnet) {
  let factories = {};

  factories.AddressBookFactory = await hre.ethers.getContractFactory(
    "AddressBook",
    owner
  );
  factories.TokenFactory = await hre.ethers.getContractFactory(
    "MockMintableToken",
    owner
  );
  factories.BondsFactory = await hre.ethers.getContractFactory("Bonds", owner);
  factories.ScoreDBFactory = await hre.ethers.getContractFactory(
    "ScoreDB",
    owner
  );
  factories.NFCSFactory = await hre.ethers.getContractFactory("NFCS", owner);
  factories.RevenueManagerFactory = await hre.ethers.getContractFactory(
    "RevenueManager",
    owner
  );
  factories.CollateralManagerFactory = await hre.ethers.getContractFactory(
    "CollateralManager",
    owner
  );
  factories.RociPaymentFactory = await hre.ethers.getContractFactory(
    "RociPayment",
    owner
  );

  const priceFeed = isForkOrTestnet
    ? "contracts/testing/PriceFeed.sol:PriceFeedMock"
    : "PriceFeed";

  factories.PriceFeedFactory = await hre.ethers.getContractFactory(
    priceFeed,
    owner
  );
  factories.InvestorFactory = await hre.ethers.getContractFactory(
    "PoolInvestor",
    owner
  );
  return factories;
}

function createReportFile(logPath, deployerPrivateKey) {
  const report = {
    contracts: [],
    state: {
      finished: false,
      deployCostWei: null,
      configCostWei: null,
      deployTime: null,
      verifyingTime: null,
      deployerPrivateKey: deployerPrivateKey,
    },
  };
  fs.writeFileSync(logPath, JSON.stringify(report, null, 2));
}

function updateReportContracts(deployedContract, logPath) {
  const contractToAdd = composeDeployData(deployedContract);
  const oldData = JSON.parse(fs.readFileSync(logPath));
  oldData.contracts.push(contractToAdd);
  fs.writeFileSync(logPath, JSON.stringify(oldData, null, 2));
}

function updateReportState(status, deployCost, logPath, configCost) {
  const oldData = JSON.parse(fs.readFileSync(logPath));
  oldData.state.finished = status;
  oldData.state.deployCostWei = deployCost.toString();
  if (configCost !== undefined) {
    oldData.state.configCostWei = configCost.toString();
  }
  fs.writeFileSync(logPath, JSON.stringify(oldData, null, 2));
}

function composeDeployData(contract) {
  let instance = {};
  let toURL = contract.addresses.impl;

  instance.name = contract.name;
  instance.address = contract.addresses.impl;

  if (contract.isProxy) {
    instance.proxy = contract.addresses.proxy;
    toURL = contract.addresses.proxy;
  }

  if (
    !checkIsFork() &&
    hre.network.name !== "hardhat" &&
    hre.network.name !== "maticFork"
  ) {
    instance.url = buildContractUrl(
      chainConfig[hre.network.name].urls.browserURL,
      toURL
    );
  }

  return instance;
}

async function getContractSource(contractName) {
  let artifact = await hre.artifacts.readArtifact(contractName);

  return `${artifact.sourceName}:${artifact.contractName}`;
}

function isOnChain() {
  return hre.network.name !== "hardhat" || checkIsFork();
}

function getDepositAmount(
  amount,
  paymentReserve,
  deptTotalSupply,
  reserveRate
) {
  const numerator = amount.mul(deptTotalSupply);
  const denominator = paymentReserve.add(
    amount.mul(toWei("100").sub(reserveRate))
  );
  return numerator.mul(reserveRate).div(denominator.mul(toWei("100")));
}

function getWithdrawalAmount(
  amount,
  paymentReserve,
  deptTotalSupply,
  reserveRate
) {
  const numerator = amount.mul(paymentReserve);
  const denominator = deptTotalSupply.add(
    amount.mul(toWei("100").sub(reserveRate))
  );
  return numerator.mul(toWei("100")).div(denominator.mul(reserveRate));
}

async function quickAddCollateralEther(user, amount, cs) {
  await setTokenBalanceFor(cs.TestETH, user, amount);
  await cs.TestETH.connect(user).approve(cs.CollateralManager.address, amount);
  await cs.RociPayment.connect(user).addCollateral(
    user.address,
    cs.TestETH.address,
    amount
  );
}

async function calculateCollateralForBorrow(
  priceFeed,
  toBorrow,
  ltv,
  collateralContract,
  assetContract
) {
  let [collateralPrice, decimals] = await priceFeed.getLatestPriceUSD(
    collateralContract.address
  );
  const collateralDecimals = await collateralContract.decimals();
  decimals = decimals + collateralDecimals;

  if (typeof toBorrow === "string") {
    toBorrow = await toTokenWei(toBorrow, assetContract);
  }

  const collateral = toBorrow
    .mul(BigNumber.from("10").pow(decimals))
    .div(collateralPrice)
    .div(BigNumber.from("10").pow(await assetContract.decimals()))
    .mul(toWei("100"))
    .div(toWei(ltv));

  return collateral.add(collateral.div("100")); //calculation accuracy problem, just add 1% to collateral here
}

function loadContract(address, abiName) {
  return new ethers.Contract(address, loadAbi(abiName), ethers.provider);
}

async function snapshot() {
  return await hre.network.provider.send("evm_snapshot");
}

async function revert(state) {
  await hre.network.provider.send("evm_revert", [state]);
}

async function gasStation(mode) {
  const req = await axios.get(GAS_STATION_URL);
  return {
    maxPriorityFeePerGas: ethers.utils.parseUnits(
      BigNumber.from(parseInt(req.data[mode].maxPriorityFee))
        .add("1")
        .toString(),
      "gwei"
    ),
    maxFeePerGas: ethers.utils.parseUnits(
      BigNumber.from(parseInt(req.data[mode].maxFee)).add("1").toString(),
      "gwei"
    ),
  };
}

function getCollateralAmount(amount, score, collateralPrice) {
  // TODO: this formula not working for score above 8
  return toWei(amount)
    .div(collateralPrice)
    .mul(toWei("100"))
    .div(toWei(NFCS_SCORE_TO_USDC_LTV[score])) // LTV for score 5
    .add("1000");
}

async function generateOrUpdateScore(user, score, cs) {
  const hasNFCS = await cs.NFCS.tokenExistence(user.address);
  if (!hasNFCS) {
    await mint(cs.NFCS, user);
  }
  const NFCSID = Number(await cs.NFCS.getToken(user.address));
  await updateScore(cs.ScoreDB, NFCSID, score, user);
  return NFCSID;
}

/**
   * @typedef {("deposit"|"borrow"|"payment")} ActionType
   * /
   *
   * /**
   * @typedef {Object} Validation
   * @property {Function} call - function to call
   * @property {any[]} args - arguments for function
   * @property {Function} convert - function to convert the result of call
   * @property {any} result - the desired outcome
   * /
    /**
   * @typedef {Object} Action
   * @property {any} user - user object
   * @property {number} amount - amount of token
   * @property {any} token - token object
   * @property {ActionType} actionType - action type
   * @property {number} mineTime - time in seconds
   * @property {number} score - time in seconds
   * @property {Validation[]} validations
   * @property {string} revertError
   * @property {Function} oneLinerCall
   */
/**
 * @param {Action[]} actions - array of actions
 * @param {any} cs - contracts object
 */
const executeActions = async (actions, cs) => {
  for (const [actionIndex, action] of actions.entries()) {
    const {
      token,
      user,
      amount,
      actionType,
      mineTime,
      score,
      validations,
      revertError,
      oneLinerCall,
    } = action;

    const amountString = amount?.toString();
    const runAction = async () => {
      if (actionType === "deposit") {
        await setTokenBalanceFor(token, user, amountString);
        await deposit({
          user,
          amount: amountString,
          token,
          pool: cs.Investor,
        });
      }

      if (actionType === "borrow") {
        await quickBorrowWithPreciseCollaterall(cs, user, score, token, amount);
      }

      if (actionType === "payment") {
        const loanID = await getLastLoanId(cs.RociPayment, user.address);
        await token
          .connect(user)
          .approve(
            cs.RociPayment.address,
            await toTokenWei(amount, cs.TestUSDC)
          );
        await cs.RociPayment.connect(user).payment(
          loanID,
          await toTokenWei(amount, cs.TestUSDC),
          ROCI_PAYMENT_VERSION
        );
        await cs.Investor.collect([loanID], VERSION);
      }

      if (oneLinerCall) {
        await oneLinerCall();
      }
    };

    await runAction()
      .then(() =>
        revertError
          ? Promise.reject({
              shouldRevert: `Action ${actionIndex} should revert with ${revertError}`, // eslint-disable-line
            }) // eslint-disable-line
          : true
      )
      .catch(
        async (err) =>
          err.shouldRevert
            ? // if transaction is not truly reverted but expected tothis check will always fail
              expect(err.shouldRevert).to.equal(revertError) // eslint-disable-line
            : // only for true blockchain revert
              expect(Promise.reject(err)).to.be.revertedWith(revertError) // eslint-disable-line
      );

    if (validations) {
      for (const [index, validation] of validations.entries()) {
        const { call, args = [], convert = (x) => x, result } = validation;
        expect(await call(...args).then(convert)).to.equal(
          result,
          `Failed: action - ${actionIndex}, validation - ${index}`
        );
      }
    }

    if (mineTime) {
      await mine(mineTime);
    }
  }
};

async function quickBorrowWithPreciseCollaterall(
  cs,
  user,
  score,
  token,
  amount,
  debugAmount,
  investorType = "Investor"
) {
  const amountString = amount.toString();
  const NFCSID = await generateOrUpdateScore(user, score, cs);
  await setTokenBalanceFor(token, user, amountString);

  const requiredCollateral =
    debugAmount ||
    (await calculateCollateralForBorrow(
      cs.PriceFeed,
      amountString,
      NFCS_SCORE_TO_USDC_LTV[score],
      cs.TestETH,
      cs.TestUSDC
    ));

  await token
    .connect(user)
    .approve(cs.CollateralManager.address, requiredCollateral);

  await borrow(
    cs.RociPayment,
    cs[investorType],
    user,
    amountString,
    NFCSID,
    ethers.utils.formatEther(requiredCollateral),
    cs.TestETH,
    cs.TestUSDC
  );

  return requiredCollateral;
}

// Convenient method for testing borrowing: sets score, amount, borrows, returns loanID
async function quickborrow(
  cs,
  user,
  amount,
  colAmount = 1,
  investorType = "Investor",
  score = 2
) {
  let NFCSID;
  try {
    NFCSID = Number(await cs.NFCS.getToken(user.address));
  } catch (ex) {
    await mint(cs.NFCS, user, VERSION);
    NFCSID = Number(await cs.NFCS.getToken(user.address));
  }

  await updateScore(cs.ScoreDB, NFCSID, score, user);

  if (colAmount > 0) {
    const collateralAmount = toWei(colAmount);

    await cs.TestETH.connect(user).approve(
      cs.CollateralManager.address,
      collateralAmount
    );

    await setTokenBalanceFor(cs.TestETH, user, collateralAmount);
  }

  await borrow(
    cs.RociPayment,
    cs[investorType],
    user,
    await fromTokenWei(amount, cs.TestUSDC),
    NFCSID,
    colAmount,
    cs.TestETH,
    cs.TestUSDC
  );

  const loanID = await getLastLoanId(cs.RociPayment, user.address);

  return loanID;
}

// Convenient method for testing deposit
async function quickdeposit(cs, user, amount, investorType = "Investor") {
  await cs.TestUSDC.connect(user).approve(cs[investorType].address, amount);
  await setTokenBalanceFor(cs.TestUSDC, user, amount);
  await cs[investorType].connect(user).depositPool(amount, VERSION);
}

function getInvestorTypeByScore(score) {
  if (score < 1 || score > 10) {
    throw new Error("Score should be between 1 and 10");
  }
  switch (score) {
    case 1:
    case 2:
    case 3:
      return "InvestorRuSDC1";
    case 4:
    case 5:
    case 6:
      return "InvestorRuSDC2";
    default:
      return "InvestorRuSDC3";
  }
}

async function quickPayment(
  cs,
  user,
  amount,
  loanId,
  investorType = "Investor"
) {
  const amountWei = await toTokenWei(amount, cs.TestUSDC);
  await cs.TestUSDC.connect(user).approve(cs.RociPayment.address, amountWei);
  await cs.RociPayment.connect(user).payment(
    loanId,
    amountWei,
    ROCI_PAYMENT_VERSION
  );
  await cs[investorType].collect([loanId], VERSION);
}

function randomBigNumber(min, max) {
  min = BigNumber.from(min.toString());
  max = BigNumber.from(max.toString());

  expect(max.gt(min)).true;

  const diff = max.sub(min);
  return min.add(BigNumber.from(ethers.utils.randomBytes(32)).mod(diff));
}

async function getPreciseInterest(cs, loanId, timeNow) {
  const { interestRate, accrualPeriod, principal, issueDate } =
    await cs.RociPayment.loanLookup(loanId);

  const periodsStaked = BigNumber.from(
    parseInt((timeNow - issueDate) / accrualPeriod)
  );

  const loanInterest = periodsStaked.mul(
    principal.mul(interestRate).div(BigNumber.from(ONE_HUNDRED_PERCENT_WEI))
  );

  return loanInterest;
}

async function calculateInterest(investor, addressBook, loan, collectTx) {
  const periodsInYear = 12 * 24 * 30;

  if ([undefined, null, false].includes(collectTx)) {
    return loan.totalPaymentsValue;
  }

  const collectTimestamp = BigNumber.from(
    (await ethers.provider.getBlock(collectTx.blockHash)).timestamp
  );

  const rate = await investor.interestRateAnnual();

  const penaltyMultiplyer = await addressBook.penaltyAPYMultiplier();

  const interestRate = rate.div(periodsInYear);

  const loanPeriods = collectTimestamp
    .sub(loan.issueDate)
    .div(loan.accrualPeriod);

  let expectedValue = loanPeriods.mul(
    loan.principal.mul(interestRate).div(toWei("100"))
  );

  let lateFee = BigNumber.from("0");

  if (collectTimestamp >= loan.maturityDate) {
    const penaltyInterest = interestRate.mul(penaltyMultiplyer);

    const penaltyPeriods = collectTimestamp
      .sub(loan.maturityDate)
      .div(loan.accrualPeriod);

    lateFee = penaltyPeriods.mul(
      loan.principal.mul(penaltyInterest).div(toWei("100"))
    );
  }

  return expectedValue.add(lateFee);
}

async function getCollateralUsdPrice(cs, collateralAmount) {
  const [ethPrice, colFeedDecimals] = await cs.PriceFeed.getLatestPriceUSD(
    cs.TestETH.address
  );
  return ethPrice
    .mul(collateralAmount)
    .div(ethers.utils.parseUnits("1", colFeedDecimals));
}

module.exports = {
  assertEquals,
  loadAbi,
  setupAMM,
  getLastLoanId,
  sleep,
  setAutoMine,
  mine,
  toWei,
  toTokenWei,
  fromWei,
  calculateDepositReward,
  fromWeiInt,
  fromWeiNumber,
  getLastBlockTimestamp,
  borrow,
  localDeployV3,
  attachContractsV3,
  configureContractsV3,
  setTokenBalanceFor,
  setTokenBalanceForFork,
  mint,
  updateScore,
  getFactories,
  updateReportContracts,
  checkIsFork,
  getContractSource,
  composeDeployData,
  configureForTests,
  configureAfterDeploy,
  isOnChain,
  getDepositAmount,
  getWithdrawalAmount,
  calculateCollateralForBorrow,
  loadContract,
  getRecentlyDeployed,
  createReportFile,
  updateReportState,
  configureForFork,
  snapshot,
  revert,
  gasStation,
  deposit,
  executeActions,
  inPercentRange,
  getCollateralAmount,
  generateOrUpdateScore,
  fromTokenWei,
  quickborrow,
  quickdeposit,
  getAllLoans,
  collectAllLoans,
  quickPayment,
  quickBorrowWithPreciseCollaterall,
  fromWeiToDollars,
  randomBigNumber,
  updateLLL,
  quickAddCollateralEther,
  getPreciseInterest,
  calculateInterest,
  calculateExpectedCollateralAmountFromLiquidation,
  sumBigNumbers,
  getCollateralUsdPrice,
  getInvestorTypeByScore,
};
