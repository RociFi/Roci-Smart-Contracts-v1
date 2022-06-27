/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IAddressBook{
    function addressList(uint role) external view returns (address);
    function setAddressToRole(uint role, address newAddress) external;
    function roleLookupErrorMessage(uint role) external view returns(string memory);

    function dailyLimit() external  view returns (uint128);
    function globalLimit() external view returns (uint128);
    function setDailyLimit(uint128 newLimit) external;
    function setGlobalLimit(uint128 newLimit) external;
    function getMaturityDate() external view returns (uint256);
    function setLoanDuration(uint256 _newLoanDuration) external;

    function userDailyLimit() external  view returns (uint128);
    function userGlobalLimit() external view returns (uint128);
    function setUserDailyLimit(uint128 newLimit) external;
    function setUserGlobalLimit(uint128 newLimit) external;

    function globalNFCSLimit(uint _nfcsId) external view  returns (uint128);
    function setGlobalNFCSLimit(uint _nfcsId, uint128 newLimit) external;

    function latePenalty() external  view returns (uint);
    function scoreValidityPeriod() external view returns (uint);
    function setLatePenalty(uint newPenalty) external;
    function setScoreValidityPeriod(uint newValidityPeriod) external;

    function minScore() external  view returns (uint16);
    function maxScore() external view returns (uint16);
    function setMinScore(uint16 newScore) external;
    function setMaxScore(uint16 newScore) external;

    function notGenerated() external  view returns (uint16);
    function generationError() external view returns (uint16);
    function setNotGenerated(uint16 newValue) external;
    function setGenerationError(uint16 newValue) external;

    function penaltyAPYMultiplier() external  view returns (uint8);
    function gracePeriod() external view returns (uint128);
    function setPenaltyAPYMultiplier(uint8 newMultiplier) external;
    function setGracePeriod(uint128 newPeriod) external;

    function defaultPoolDailyLimit() external  view returns (uint128);
    function defaultPoolGlobalLimit() external view returns (uint);
    function setDefaultPoolDailyLimit(uint128 newLimit) external;
    function setDefaultPoolGlobalLimit(uint newLimit) external;

    function poolDailyLimit(address pool) external  view returns (uint128);
    function poolGlobalLimit(address pool) external view returns (uint);
    function setPoolDailyLimit(address pool,uint128 newLimit) external;
    function setPoolGlobalLimit(address pool,uint newLimit) external;

    function limitResetTimestamp() external view returns (uint128);
    function updateLimitResetTimestamp() external;
    function setLimitResetTimestamp(uint128 newTimestamp) external;
}
