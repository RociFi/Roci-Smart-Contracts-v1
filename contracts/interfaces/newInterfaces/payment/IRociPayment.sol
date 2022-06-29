/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "./IERC20CollateralPayment.sol";

/**
 * @title IRociPayment
 * @author RociFI Labs
 * @dev
 * Anything specific to Roci should be in this contract if we choose to use it such as Ownable logic and onlyOwner
 * functions, whitelists and global limits.
 */
interface IRociPayment is IERC20CollateralPayment {
    /**
     * @dev function for admin to liquidate a loan manually
     */
    function liquidateLoans(uint256[] memory _ids, string memory version) external;

    function isScoreValidForBorrow(
        address user,
        uint256 nfcsId,
        uint16[] memory validScores
    ) external returns (bool);
}
