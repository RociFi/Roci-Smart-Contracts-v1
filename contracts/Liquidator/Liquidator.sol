// /// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

// import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
// import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";


// import { Errors } from "../libraries/Errors.sol";
// import "../libraries/Loan.sol";

// import {AddressHandlerAbstract} from "../utilities/AddressHandlerAbstract.sol";

// import { LIQUIDATOR_VERSION } from "../ContractVersions.sol";

// import { ICollateralManager } from "../interfaces/newInterfaces/managers/ICollateralManager.sol";
// import "../interfaces/newInterfaces/payment/IRociPayment.sol";
// import { ILiquidator } from "../interfaces/ILiquidator.sol";

// contract Liquidator is
//   Initializable,
//   OwnableUpgradeable,
//   UUPSUpgradeable,
//   ILiquidator,
//   AddressHandlerAbstract
//   {

//   // Events
//   event Liquidated(uint256 timestamp, uint256 indexed loanId);

//   /// @custom:oz-upgrades-unsafe-allow constructor
//   constructor() {
//     _disableInitializers();
//   }

//   function initialize(address _addressBook) public initializer {
//     __Ownable_init();
//     __UUPSUpgradeable_init();
//     addressBook = IAddressBook(_addressBook);
//   }

//   function getAddressBook() public view override returns (IAddressBook) {
//     return addressBook;
//   }

//   /**
//    * @dev function for admin to liquidate a loans manually
//    */
//   function liquidate(uint256[] memory _ids) external override onlyRole(Role.admin) {
//     IRociPayment pc = IRociPayment(lookup(Role.paymentContract));

//     for (uint256 i = 0; i < _ids.length; i++) {
//       if(pc.isDelinquent(_ids[i])){
//         _liquidate(_ids[i], msg.sender);

//         emit LiquidatedOnMaturity(block.timestamp, _ids[i]);
//       }
//     }
//   }

//   /**
//    * @dev function liquidates deliquient loan and transfer collateral to _receiver
//    * @param _id is id of the loan that need to be liquidated
//    * @param _receiver collateral receiver
//    */
//   function _liquidate(uint256 _id, address _receiver) internal virtual {
//     address cAddress; //collateral address
//     uint256 cAmount; //collateral amount
//     uint256 cPrice; //collateral price in asset weis
//     uint256 cToRepay; //collateral to send to liquidator
//     uint8 cDecimals; //collateral token decimals
//     uint8 aDecimals; //asset token decimals
//     uint8 pDecimals; //data(price) feeder decimals

//     IRociPayment pc = IRociPayment(lookup(Role.paymentContract));
//     ICollateralManager collManager = ICollateralManager(lookup(Role.collateralManager));

//     Loan.loan memory lInfo; //loan info

//     lInfo = pc.loanLookup(_id);

//     (cAddress, cAmount) = collManager.getCollateralLookup(
//       address(this),
//       lInfo.borrower
//     );

//     //TODO: expose _safeGetPriceOf and userActiveLoans in RociPayment
//     //(cPrice, pDecimals) = pc._safeGetPriceOf(cAddress);

//     cDecimals = IERC20Metadata(cAddress).decimals();

//     aDecimals = IERC20Metadata(lInfo.ERC20Address).decimals();

//     //Borrower has one loan
//     // if(pc.usersActiveLoans[lInfo.borrower].length == 1){
//     //  uint256 cInAsset = pc.fromTokenToFeedPrice(
//     //   cAmount, 
//     //   cDecimals, 
//     //   aDecimals, 
//     //   cPrice, 
//     //   pDecimals
//     // );

//     // if(cInAsset <= lInfo.totalPaymentsValue){
//     //   cToRepay = cAmount;
//     // } else {
//     //   cToRepay = lInfo.totalPaymentsValue / cInAsset;
//     // }
//     // }else{
//     //   //WIP
//     // }

//     //Loan.onLiquidate(pc.loanLookup(_id));

//     collManager.withdrawal(
//       pc.loanLookup(_id).borrower,
//       cToRepay,
//       _receiver
//     );
//   }

//   /**
//    * @notice returns the current version of the contract.
//    */
//   function currentVersion() public pure override returns (string memory) {
//       return LIQUIDATOR_VERSION;
//   }
// }
