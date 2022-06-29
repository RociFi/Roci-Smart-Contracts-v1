// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import {IAddressBook} from "../../IAddressBook.sol";
import {IVersion} from "../../../Version/IVersion.sol";
import "../../../libraries/Structs.sol";

/**
 * @title Investor
 * @author RociFI Labs
 * @dev is an ERC20
 */
interface Iinvestor is IVersion {
    /*
    State variables
     */
    function interestRateAnnual() external returns (uint256);

    // note addresses are replaced with address book
    // enum is the index in the array returned by addressBook's function
    enum addresses_Investor {
        token,
        bonds,
        paymentContract
    }

    function borrow(Structs.BorrowArgs calldata, string memory) external;
}
