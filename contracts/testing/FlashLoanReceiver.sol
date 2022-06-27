// SPDX-License-Identifier: UNLICENSED;
pragma solidity 0.8.4;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {PoolInvestor} from "../investorContract/PoolInvestor.sol";

contract FlashLoanReceiver {
    using SafeMath for uint256;

    address public immutable ADDRESSES_PROVIDER;
    address public immutable LENDING_POOL;
    PoolInvestor public immutable POOL_INVESTOR;

    constructor(address addressesProvider, address lendingPool, PoolInvestor poolInvestor) {
        ADDRESSES_PROVIDER = addressesProvider;
        LENDING_POOL = lendingPool;
        POOL_INVESTOR = poolInvestor;
    }

    function executeOperation(
        address[] memory assets,
        uint256[] memory amounts,
        uint256[] memory premiums,
        address initiator
        // bytes memory params
    ) public returns (bool) {

        for (uint256 i = 0; i < assets.length; i++) {
            /// @dev Approve asset amount to PoolInvestor
            require(
                IERC20Metadata(assets[i]).approve(address(POOL_INVESTOR), amounts[i]),
                "ERC20: Unable to approve assets to PoolInvestor"
            );

            /// @dev Deposit and withdraw within one action
            // POOL_INVESTOR.depositPool(amounts[i]);
            // POOL_INVESTOR.withdrawalPool(type(uint256).max);

            uint256 debt = amounts[i].add(premiums[i]);
            uint256 assetBalance = IERC20Metadata(assets[i]).balanceOf(address(this));

            if (debt > assetBalance) {
                /// @dev Pay from own funds to cover the missing part of debt
                require(
                    IERC20Metadata(assets[i]).transferFrom(
                        initiator,
                        address(this),
                        debt.sub(assetBalance)
                    ),
                    "ERC20: Unable to transfer assets back and cover debt"
                );
            }

            IERC20Metadata(assets[i]).approve(address(LENDING_POOL), debt);
        }

        return true;
    }
}
