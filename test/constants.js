const errors = {
  NFCS_TOKEN_MINTED: "0", //  Token already minted
  NFCS_TOKEN_NOT_MINTED: "1", //  No token minted for address
  NFCS_ADDRESS_BUNDLED: "2", // Address already bundled
  NFCS_WALLET_VERIFICATION_FAILED: "3", //  Wallet verification failed
  NFCS_NONEXISTENT_TOKEN: "4", // Nonexistent NFCS token
  NFCS_TOKEN_HAS_BUNDLE: "5", //  Token already has an associated bundle
  NFCS_TOKEN_HAS_NOT_BUNDLE: "6", //  Token does not have

  BONDS_HASH_AND_ENCODING: "100", //  Hash of data signed must be the paymentContractAddress and id encoded in that order
  BONDS_BORROWER_SIGNATURE: "101", // Data provided must be signed by the borrower
  BONDS_NOT_STACKING: "102", //  Not staking any NFTs
  BONDS_NOT_STACKING_INDEX: "103", //  Not staking any tokens at this index
  BONDS_DELETE_HEAD: "104", // Cannot

  INVESTOR_ISSUE_BONDS: "200", //  Issue minting bonds
  INVESTOR_INSUFFICIENT_AMOUNT: "201", //  Cannot borrow an
  INVESTOR_BORROW_WITH_ANOTHER_SCORE: "202", //  Cannot borrow if there is active loans with different score

  POOL_INVESTOR_INTEREST_RATE: "300", // Interest rate has to be greater than zero
  POOL_INVESTOR_ZERO_POOL_VALUE: "301", // Pool value is zero
  POOL_INVESTOR_ZERO_TOTAL_SUPPLY: "302", // Total supply is zero
  POOL_INVESTOR_BONDS_LOST: "303", // Bonds were lost in unstaking
  POOL_INVESTOR_NOT_ENOUGH_FUNDS: "304", // Not enough funds to fulfill the loan
  POOL_INVESTOR_DAILY_LIMIT: "305", // Exceeds daily deposits limit
  POOL_INVESTOR_GLOBAL_LIMIT: "306", // Exceeds total deposits limit

  MANAGER_COLLATERAL_NOT_ACCEPTED: "400", // Collateral is not accepted
  MANAGER_COLLATERAL_INCREASE: "401", // When increasing collateral, the same ERC20 address should be used
  MANAGER_ZERO_WITHDRAW: "402", // Cannot withdrawal zero
  MANAGER_EXCEEDING_WITHDRAW: "403", // Requested withdrawal amount is too large

  SCORE_DB_EQUAL_LENGTH: "501", // Arrays must be of equal length
  SCORE_DB_VERIFICATION: "502", // Unverified score

  PAYMENT_NFCS_OUTDATED: "600", // Outdated NFCS score outdated
  PAYMENT_ZERO_LTV: "601", // LTV cannot be zero
  PAYMENT_NOT_ENOUGH_COLLATERAL: "602", // Not enough collateral to issue a loan
  PAYMENT_NO_BONDS: "603", // There is no bonds to liquidate a loan
  PAYMENT_FULFILLED: "604", // Contract is paid off
  PAYMENT_NFCS_OWNERSHIP: "605", // NFCS ID must belong to the borrower
  PAYMENT_NON_ISSUED_LOAN: "606", // Loan has not been issued
  PAYMENT_WITHDRAWAL_COLLECTION: "607", // There are not enough payments available for collection
  PAYMENT_LOAN_NOT_DELINQUENT: "608", // Loan not delinquent
  PAYMENT_AMOUNT_TOO_LARGE: "609", // Payment amount is too large
  PAYMENT_CLAIM_COLLATERAL: "610", // Cannot claim collateral if this collateral is necessary for any non Closed/Liquidated loan's delinquency status

  PRICE_FEED_TOKEN_NOT_SUPPORTED: "700", // Token is not supported

  REVENUE_ADDRESS_TO_SHARE: "800", // Non-equal length of addresses and shares
  REVENUE_UNIQUE_INDEXES: "801", // Indexes in an array must not be duplicate
  REVENUE_FAILED_ETHER_TX: "802", // Failed to send Ether
  REVENUE_UNVERIFIED_INVESTOR: "803", // Only verified investors may request funds
  REVENUE_NOT_ENOUGH_FUNDS: "804", // Not enough funds to complete this request

  LOAN_MIN_PAYMENT: "900", // Minimal payment should be made
  LOAN_DAILY_LIMIT: "901", // Exceeds daily borrow limit
  LOAN_DAILY_LIMIT_USER: "902", // Exceeds user daily borrow limit
  LOAN_TOTAL_LIMIT_USER: "903", // Exceeds user total borrow limit
  LOAN_TOTAL_LIMIT: "904", // Exceeds total borrow limit
  LOAN_CONFIGURATION: "905", // Loan that is already issued, or not configured cannot be issued
  LOAN_TOTAL_LIMIT_NFCS: "906", // Exceeds total nfcs borrow limit
  LOAN_DAILY_LIMIT_NFCS: "907", // Exceeds daily nfcs borrow limit

  VERSION: "1000", // Incorrect version of contract

  ADDRESS_HANDLER_MISSING_ROLE_TOKEN: "1200", // Lookup failed for role Token
  ADDRESS_HANDLER_MISSING_ROLE_BONDS: "1201", // Lookup failed for role Bonds
  ADDRESS_HANDLER_MISSING_ROLE_INVESTOR: "1202", // Lookup failed for role Investor
  ADDRESS_HANDLER_MISSING_ROLE_PAYMENT_CONTRACT: "1203", // Lookup failed for role Payment Contract
  ADDRESS_HANDLER_MISSING_ROLE_REV_MANAGER: "1204", // Lookup failed for role Revenue Manager
  ADDRESS_HANDLER_MISSING_ROLE_COLLATERAL_MANAGER: "1205", // Lookup failed for role Collateral Manager
  ADDRESS_HANDLER_MISSING_ROLE_PRICE_FEED: "1206", // Lookup failed for role Price Feed
  ADDRESS_HANDLER_MISSING_ROLE_ORACLE: "1207", // Lookup failed for role Oracle
  ADDRESS_HANDLER_MISSING_ROLE_ADMIN: "1208", // Lookup failed for role Admin
  ADDRESS_HANDLER_MISSING_ROLE_PAUSER: "1209", // Lookup failed for role Pauser
};

const LOAN_STATUSES = [
  "UNISSUED",
  "NEW",
  "APPROVED",
  "PAIDPART",
  "CLOSED",
  "PAIDLATE",
  "DEFAULT",
  "LATE",
];

const VERSION = "1.0.0";
const VERSION_V2 = "2.0.0";

const ROCI_PAYMENT_VERSION = "2.0.0";

const NFCS_SCORE_TO_USDC_LTV = {
  1: 205,
  2: 195,
  3: 185,
  4: 145,
  5: 135,
  6: 125,
  7: 115,
  8: 85.5,
  9: 80,
  10: 75,
};

// Must match with roles in contracts/Globals.sol
const ROLE_TOKEN = 0;
const ROLE_BONDS = 1;
const ROLE_PAYMENT_CONTRACT = 2;
const ROLE_REV_MANAGER = 3;
const ROLE_NFCS = 4;
const ROLE_COLLATERAL_MANAGER = 5;
const ROLE_PRICE_FEED = 6;
const ROLE_ORACLE = 7;
const ROLE_ADMIN = 8;
const ROLE_PAUSER = 9;

module.exports = {
  errors,
  LOAN_STATUSES,
  VERSION,
  VERSION_V2,
  NFCS_SCORE_TO_USDC_LTV,
  ROCI_PAYMENT_VERSION,
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
};
