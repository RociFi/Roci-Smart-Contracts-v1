/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import {IAddressBook} from "../interfaces/IAddressBook.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract AddressHandler {
    IAddressBook public addressBook;

    constructor(IAddressBook _addressBook) {
        addressBook = _addressBook;
    }

    modifier onlyRole(uint256 _role) {
        require(msg.sender == lookup(_role), addressBook.roleLookupErrorMessage(_role));

        _;
    }

    function lookup(uint256 _role) internal view returns (address contractAddress) {
        contractAddress = addressBook.addressList(_role);

        require(contractAddress != address(0), addressBook.roleLookupErrorMessage(_role));
    }
}
