/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

// import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../manager/Manager.sol";
import "../interfaces/newInterfaces/managers/IRevenueManager.sol";
import "../libraries/Structs.sol";
import "../libraries/Functions.sol";
import {Errors} from "../libraries/Errors.sol";

import "../Globals.sol";

/**
 * @title Payment Splitter
 * @author RociFI Labs
 * @dev A contract to split ERC20 tokens among several addresses and is updateable
 */
abstract contract PaymentSplitter is IRevenueManager, Manager {
    using SafeERC20 for IERC20Metadata;
    // array of Shares to be itterated
    Structs.Share[] public shares;
    // total shares to determine how much a share is worth
    uint256 public totalShares;

    // Stores the balances of each pool in RevenueManager
    mapping(address => uint256) internal poolBalances;

    constructor(IAddressBook _addressBook) AddressHandler(_addressBook) {}

    /**
     * @dev Checks that investor calling the contract is verified
     */
    modifier verifyInvestor() {
        require(acceptedCollateral[msg.sender], Errors.REVENUE_UNVERIFIED_INVESTOR);
        _;
    }

    /**
     * @dev utility function to easily get shares length
     */
    function getSharesLength() external view returns (uint256) {
        return (shares.length);
    }

    /**
     * @dev dev function to add more payees and their shares
     * @param _payees is the array of addresses
     * @param _shares is the arrya of share amounts. Must be the same size as Payees
     */
    function addShares(address[] calldata _payees, uint256[] calldata _shares)
        external
        onlyRole(ROLE_ADMIN)
    {
        require(_payees.length == _shares.length, Errors.REVENUE_ADDRESS_TO_SHARE);

        for (uint256 i = 0; i < _payees.length; i++) {
            shares.push(Structs.Share(_payees[i], _shares[i]));
            totalShares += _shares[i];
        }
    }

    /**
     * @dev Owner function to remove shares by indecies
     * @param _indecies is the array of indecies to remove from Shares array
     */
    function removeShares(uint256[] calldata _indecies) external onlyRole(ROLE_ADMIN) {
        require(Functions.isUnique(_indecies), Errors.REVENUE_UNIQUE_INDEXES);
        Functions.quickSortDESC(_indecies, int256(0), int256(_indecies.length - 1));
        for (uint256 i = 0; i < _indecies.length; i++) {
            totalShares -= shares[_indecies[i]].share; // decrease total number of shares
            shares[_indecies[i]] = shares[shares.length - i - 1]; // overwrite it with the last struct
        }
        for (uint256 i = 0; i < _indecies.length; i++) {
            shares.pop();
        }
    }

    /**
     * @dev receive payment from PoolInvestor
     * @param _tokenContract address
     * @param _amount to transfer
     */
    function payment(address _tokenContract, uint256 _amount)
        public
        virtual
        whenNotPaused
        verifyInvestor
    {
        IERC20Metadata(_tokenContract).safeTransferFrom(msg.sender, address(this), _amount);
        poolBalances[msg.sender] += _amount;
    }

    /**
     * @dev return share for RevenueManager
     * @param amount of earned interest
     * @return amount of interest for RevenueManager
     */
    function getRevenueManagerShare(uint256 amount) public view returns (uint256) {
        for (uint256 i = 0; i < shares.length; i++) {
            if (shares[i].payee == address(this)) {
                return Functions.roundedDiv((amount * shares[i].share), totalShares);
            }
        }
        // if there is no shares of RevenueManager allocate whole amount to it
        return amount;
    }

    /**
     * @dev Calculate the amount of shares minus RevenueManager shares
     * @return _shares of interest for RevenueManager
     */
    function sharesWithoutRevenueManager() internal view returns (uint256 _shares) {
        for (uint256 i = 0; i < shares.length; i++) {
            if (shares[i].payee == address(this)) {
                _shares = totalShares - shares[i].share;
            }
        }
    }

    /**
     * @dev function to complete a payment in ERC20 according to the splitter
     * @param _tokenContract address
     * @param _amount to transfer
     */
    function sendToShareHolders(address _tokenContract, uint256 _amount)
        public
        virtual
        whenNotPaused
        verifyInvestor
    {
        // get shares without RevenueManager part
        uint256 _shares = sharesWithoutRevenueManager();
        if (_shares != 0) {
            for (uint256 i = 0; i < shares.length; i++) {
                if (shares[i].payee != address(this)) {
                    IERC20Metadata(_tokenContract).safeTransfer(
                        shares[i].payee,
                        Functions.roundedDiv((_amount * shares[i].share), _shares)
                    );
                }
            }
        }
    }

    function withdrawToken(address token, address recipient) public onlyRole(ROLE_ADMIN) {
        IERC20Metadata rewardsToken = IERC20Metadata(token);
        // safeTransfer already reverts of false is returned, so no need for require(success).
        rewardsToken.safeTransfer(recipient, rewardsToken.balanceOf(address(this)));
    }
}
