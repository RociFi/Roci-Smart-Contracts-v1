/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import {IAddressBook} from "../interfaces/IAddressBook.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

abstract contract AddressHandlerAbstract {
  function getAddressBook() public view virtual returns (IAddressBook);

  modifier onlyRole(uint256 _role) {
    require(msg.sender == lookup(_role), getAddressBook().roleLookupErrorMessage(_role));
    _;
  }

  function lookup(uint256 _role) internal view returns (address contractAddress) {
    contractAddress = getAddressBook().addressList(_role);
    require(contractAddress != address(0), getAddressBook().roleLookupErrorMessage(_role));
  }
}
