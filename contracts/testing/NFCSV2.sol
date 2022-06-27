// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

import {NFCSInterface} from "../NFCS/NFCSInterface.sol";
import {IAddressBook} from "../interfaces/IAddressBook.sol";
import {IERC20PaymentStandard} from "../interfaces/newInterfaces/payment/IERC20PaymentStandard.sol";
import {Version} from "../Version/Version.sol";
import {ROLE_PAYMENT_CONTRACT} from "../Globals.sol";

/**
 * @title NFCSV2
 * @author RociFi Labs
 * @notice An ERC721 token contract leveraging Openzeppelin for contract base and upgradability (UUPS).
 * @notice This V2 contract is just for testing upgradeability; it is identical to the NFCS.
 * @notice Deploy "NFCS" instead of this contract
 */

contract NFCSV2 is
    Initializable,
    ERC721Upgradeable,
    ERC721EnumerableUpgradeable,
    PausableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    NFCSInterface,
    Version
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using ECDSAUpgradeable for bytes32;

    // An incrementing id for each token
    CountersUpgradeable.Counter private _tokenIdCounter;
    // Mapping from tokenId to address array (bundle)
    mapping(uint256 => address[]) private _tokenBundle;
    // Mapping to check if a token has a bundle or not
    mapping(uint256 => bool) private _bundleNonce;
    // Mapping to check if an address already has a token
    mapping(address => bool) private _mintedNonce;
    // Mapping to check if address is in a bundle or not
    mapping(address => bool) private _addressNonce;
    // Event emitted when a new token is minted
    event TokenMinted(address indexed _recipient, uint256 indexed _tokenId);

    // uint public MAXIMUM_BORROW_LIMIT;

    IAddressBook public addressBook;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __ERC721_init("NFCS", "NFCS");
        __Pausable_init();
        __Ownable_init();
        __ERC721Enumerable_init();
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Pauses the whole contract; used as emergency response in case a bug is detected. [OWNER_ONLY]
     */
    function pause() public onlyOwner {
        _pause();
    }

    /**
     * @notice unpauses the contract; resumes functionality. [OWNER_ONLY]
     */
    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * @notice mints a new token and stores an address bundle agains the tokenId. Performs signature verification to confirm ownership of addresses being bundled by sender.
     */
    function mintToken(
        address[] memory bundle,
        bytes[] memory signatures,
        string memory _message,
        uint256 _nonce,
        string memory version
    ) public override checkVersion(version) {
        require(!_mintedNonce[msg.sender], "Token already minted.");
        for (uint256 i = 0; i < bundle.length; i++) {
            // Check if any address is already part of a bundle
            require(!_addressNonce[bundle[i]], "Address already bundled.");
            // Check if the Verify (Signer matches) is true, otherwise revert
            require(
                verify(bundle[i], _message, _nonce, signatures[i]),
                "Wallet verification failed."
            );
            // If verification successful, set the _addressNonce to true to signify that this addr is now part of a bundle
            _addressNonce[bundle[i]] = true;
        }
        // Check if any of the addresses is already part of a bundle
        // Mint new token
        uint256 tokenId = _tokenIdCounter.current();
        // Send token to user
        _safeMint(msg.sender, tokenId);
        // Store address bundle against the token
        storeBundle(tokenId, bundle);
        // Set bundle nonce to true
        _bundleNonce[tokenId] = true;
        // Set minted nonce to true
        _mintedNonce[msg.sender] = true;
        // Emit TokenMinted event
        emit TokenMinted(msg.sender, tokenId);
        // Increase the token counter
        _tokenIdCounter.increment();
    }

    /**
     * @notice returns the keccak256 hash of the message and nonce
     */
    function getMessageHash(string memory _message, uint256 _nonce) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(_message, _nonce));
    }

    /**
     * @notice returns true if the _signer is indeed the originator of the signature
     */
    function verify(
        address _signer, // ADDR that claims to be signer of the message
        string memory _message,
        uint256 _nonce,
        bytes memory _sig
    ) internal pure returns (bool) {
        // Recreate msg hash from inputs
        bytes32 messageHash = getMessageHash(_message, _nonce);
        return messageHash.toEthSignedMessageHash().recover(_sig) == _signer;
    }

    /**
     * @notice stores an address bundle against a tokenId in the _tokenBundle mapping
     */
    function storeBundle(uint256 tokenId, address[] memory bundle) private {
        // Check if the token exists and whether a bundle has already been minted
        require(_exists(tokenId), "ERC721: Cannot store bundle for nonexistent token");
        require(!_bundleNonce[tokenId], "ERC721: This token already has an associated bundle");
        // Store the address bundle against tokenId
        _tokenBundle[tokenId] = bundle;
        // Set the bundle status as true to signify that a bundle is stored against this tokenId
        _bundleNonce[tokenId] = true;
    }

    /**
     * @notice returns the bundle stored against a given tokenId
     */
    function getBundle(uint256 tokenId) public view override returns (address[] memory) {
        require(_exists(tokenId), "NFCS: cannot get bundle of nonexistent token");
        require(
            _bundleNonce[tokenId],
            "NFCS: This token does not have an associated address bundle yet"
        );
        return _tokenBundle[tokenId];
    }

    /**
     * @notice returns the token owned by tokenOwner, if any.
     */
    function getToken(address tokenOwner) public view override returns (uint256) {
        require(_mintedNonce[tokenOwner] == true, "NFCS: no token owned.");
        //Now return the token owned by this address
        return tokenOfOwnerByIndex(tokenOwner, 0);
    }

    /**
  * @notice Modified this function to only check for ownership and not approved owner
    since approval functionality has been disabled. Keeping the same name for compatibility.
  */
    function _isApprovedOrOwner(address spender, uint256 tokenId)
        internal
        view
        override
        returns (bool)
    {
        require(_exists(tokenId), "ERC721: query for nonexistent token");
        address owner = ERC721Upgradeable.ownerOf(tokenId);
        return (spender == owner);
    }

    /**
     * @notice returns the current version of the contract.
     */
    function currentVersion() public pure override returns (string memory) {
        return "2.0.0";
    }

    /**
     * @notice returns true if user (an address) owns a token
     */
    function tokenExistence(address user) public view override returns (bool) {
        return _mintedNonce[user];
    }

    /**
     * @notice sets the address of the new logic contract
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @notice unused hook for compatibility with OZ base contracts
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721Upgradeable, ERC721EnumerableUpgradeable) whenNotPaused {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    /**
     * @notice returns true if a given interface is supported
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
   * @notice Removing some ERC721 functionality not yet needed.-----------------
     @dev the functions below are all impotent and all revert when called.
   */

    function approve(address, uint256) public virtual override {
        revert("ModifiedApprove: cannot approve other addresses");
    }

    function getApproved(uint256) public view virtual override returns (address) {
        revert("ModifiedGetApproved: cannot get approved address");
    }

    function setApprovalForAll(address, bool) public virtual override {
        revert("ModifiedSetApprovedForAll: cannot set approved address for all owned tokens");
    }

    function isApprovedForAll(address, address) public view virtual override returns (bool) {
        revert("ModifiedIsApprovedForAll: cannot check approval");
    }

    function transferFrom(
        address,
        address,
        uint256
    ) public virtual override {
        revert("ModifiedTransferFrom: transferFrom not supported");
    }

    function safeTransferFrom(
        address,
        address,
        uint256
    ) public virtual override {
        revert("ModifiedSafeTransferFrom: safeTransferFrom not supported");
    }

    function safeTransferFrom(
        address,
        address,
        uint256,
        bytes memory
    ) public virtual override {
        revert("ModifiedSafeTransferFrom: safeTransferFrom not supported");
    }

    // functions for global and daily limits
    function getLimits()
        external
        view
        override
        returns (
            uint128 dailyLimit,
            uint128 globalLimit,
            uint128 userDailyLimit,
            uint128 userGlobalLimit
        )
    {
        dailyLimit = addressBook.dailyLimit();
        globalLimit = addressBook.globalLimit();
        userDailyLimit = addressBook.userDailyLimit();
        userGlobalLimit = addressBook.userGlobalLimit();
    }

    function getNFCSLimits(uint256 _nfcsId)
        external
        view
        override
        returns (uint128 dailyLimit, uint128 globalLimit)
    {
        dailyLimit = 0;
        globalLimit = addressBook.globalNFCSLimit(_nfcsId);
    }

    function getTotalOutstanding(uint256 _nfcsId)
        public
        view
        override
        returns (
            uint256 globalOutstanding,
            uint256 userOutstanding,
            uint256 nfcsOutstanding
        )
    {
        IERC20PaymentStandard investor = IERC20PaymentStandard(
            addressBook.addressList(ROLE_PAYMENT_CONTRACT)
        );

        userOutstanding += investor.getUserTotalOutstanding(_nfcsId);
        globalOutstanding += investor.getTotalOutstanding();
        nfcsOutstanding += investor.getNFCSTotalOutstanding(_nfcsId);
    }
}
