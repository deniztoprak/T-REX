// SPDX-License-Identifier: GPL-3.0
// This contract is also licensed under the Creative Commons Attribution-NonCommercial 4.0 International License.
//
//                                             :+#####%%%%%%%%%%%%%%+
//                                         .-*@@@%+.:+%@@@@@%%#***%@@%=
//                                     :=*%@@@#=.      :#@@%       *@@@%=
//                       .-+*%@%*-.:+%@@@@@@+.     -*+:  .=#.       :%@@@%-
//                   :=*@@@@%%@@@@@@@@@%@@@-   .=#@@@%@%=             =@@@@#.
//             -=+#%@@%#*=:.  :%@@@@%.   -*@@#*@@@@@@@#=:-              *@@@@+
//            =@@%=:.     :=:   *@@@@@%#-   =%*%@@@@#+-.        =+       :%@@@%-
//           -@@%.     .+@@@     =+=-.         @@#-           +@@@%-       =@@@@%:
//          :@@@.    .+@@#%:                   :    .=*=-::.-%@@@+*@@=       +@@@@#.
//          %@@:    +@%%*                         =%@@@@@@@@@@@#.  .*@%-       +@@@@*.
//         #@@=                                .+@@@@%:=*@@@@@-      :%@%:      .*@@@@+
//        *@@*                                +@@@#-@@%-:%@@*          +@@#.      :%@@@@-
//       -@@%           .:-=++*##%%%@@@@@@@@@@@@*. :@+.@@@%:            .#@@+       =@@@@#:
//      .@@@*-+*#%%%@@@@@@@@@@@@@@@@%%#**@@%@@@.   *@=*@@#                :#@%=      .#@@@@#-
//      -%@@@@@@@@@@@@@@@*+==-:-@@@=    *@# .#@*-=*@@@@%=                 -%@@@*       =@@@@@%-
//         -+%@@@#.   %@%%=   -@@:+@: -@@*    *@@*-::                   -%@@%=.         .*@@@@@#
//            *@@@*  +@* *@@##@@-  #@*@@+    -@@=          .         :+@@@#:           .-+@@@%+-
//             +@@@%*@@:..=@@@@*   .@@@*   .#@#.       .=+-       .=%@@@*.         :+#@@@@*=:
//              =@@@@%@@@@@@@@@@@@@@@@@@@@@@%-      :+#*.       :*@@@%=.       .=#@@@@%+:
//               .%@@=                 .....    .=#@@+.       .#@@@*:       -*%@@@@%+.
//                 +@@#+===---:::...         .=%@@*-         +@@@+.      -*@@@@@%+.
//                  -@@@@@@@@@@@@@@@@@@@@@@%@@@@=          -@@@+      -#@@@@@#=.
//                    ..:::---===+++***###%%%@@@#-       .#@@+     -*@@@@@#=.
//                                           @@@@@@+.   +@@*.   .+@@@@@%=.
//                                          -@@@@@=   =@@%:   -#@@@@%+.
//                                          +@@@@@. =@@@=  .+@@@@@*:
//                                          #@@@@#:%@@#. :*@@@@#-
//                                          @@@@@%@@@= :#@@@@+.
//                                         :@@@@@@@#.:#@@@%-
//                                         +@@@@@@-.*@@@*:
//                                         #@@@@#.=@@@+.
//                                         @@@@+-%@%=
//                                        :@@@#%@%=
//                                        +@@@@%-
//                                        :#%%=
//
/**
 *     NOTICE
 *
 *     The T-REX software is licensed under a proprietary license or the GPL v.3.
 *     If you choose to receive it under the GPL v.3 license, the following applies:
 *     T-REX is a suite of smart contracts implementing the ERC-3643 standard and
 *     developed by Tokeny to manage and transfer financial assets on EVM blockchains
 *
 *     Copyright (C) 2024, Tokeny sàrl.
 *
 *     This program is free software: you can redistribute it and/or modify
 *     it under the terms of the GNU General Public License as published by
 *     the Free Software Foundation, either version 3 of the License, or
 *     (at your option) any later version.
 *
 *     This program is distributed in the hope that it will be useful,
 *     but WITHOUT ANY WARRANTY; without even the implied warranty of
 *     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *     GNU General Public License for more details.
 *
 *     You should have received a copy of the GNU General Public License
 *     along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 *     This specific smart contract is also licensed under the Creative Commons
 *     Attribution-NonCommercial 4.0 International License (CC-BY-NC-4.0),
 *     which prohibits commercial use. For commercial inquiries, please contact
 *     Tokeny sàrl for licensing options.
 */

pragma solidity ^0.8.17;

import "./AbstractModuleUpgradeable.sol";

contract TransferRestrictModule is AbstractModuleUpgradeable {
    // ---------------------------------------------------------------------------
    // Permission bit flags
    // ---------------------------------------------------------------------------

    /// @notice Bit 0 — address is allowed to receive tokens from another account (regular transfer, as recipient)
    uint8 public constant PERM_CAN_RECEIVE_FROM_ACCOUNT = 0x01;

    /// @notice Bit 1 — address is allowed to receive freshly minted tokens (mint recipient)
    uint8 public constant PERM_CAN_RECEIVE_MINT = 0x02;

    /// @notice Bit 2 — address is allowed to send tokens to another account (regular transfer, as sender)
    uint8 public constant PERM_CAN_SEND = 0x04;

    // ---------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------

    /**
     *  @dev Maps compliance => userAddress => permission bitmask.
     *  Each bit encodes one of the three permission flags above.
     */
    mapping(address => mapping(address => uint8)) private _userPermissions;

    // ---------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------

    /**
     *  @dev Emitted when permissions are granted to a user.
     *  @param _compliance  the compliance contract address
     *  @param _userAddress  the user whose permissions changed
     *  @param _permissions  the bitmask of permissions that were granted
     */
    event PermissionsGranted(address indexed _compliance, address indexed _userAddress, uint8 _permissions);

    /**
     *  @dev Emitted when permissions are revoked from a user.
     *  @param _compliance  the compliance contract address
     *  @param _userAddress  the user whose permissions changed
     *  @param _permissions  the bitmask of permissions that were revoked
     */
    event PermissionsRevoked(address indexed _compliance, address indexed _userAddress, uint8 _permissions);

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /**
     *  @dev Grants one or more permissions to a user by OR-ing the given bitmask
     *       into the user's current permissions.
     *  @param _userAddress  the address of the user
     *  @param _permissions  bitmask of permissions to grant (use PERM_* constants)
     *  Only the bound Compliance smart contract can call this function.
     *  Emits a `PermissionsGranted` event.
     */
    function grantPermissions(address _userAddress, uint8 _permissions) external onlyComplianceCall {
        _userPermissions[msg.sender][_userAddress] |= _permissions;
        emit PermissionsGranted(msg.sender, _userAddress, _permissions);
    }

    /**
     *  @dev Revokes one or more permissions from a user by AND-ing the inverted
     *       bitmask into the user's current permissions.
     *  @param _userAddress  the address of the user
     *  @param _permissions  bitmask of permissions to revoke (use PERM_* constants)
     *  Only the bound Compliance smart contract can call this function.
     *  Emits a `PermissionsRevoked` event.
     */
    function revokePermissions(address _userAddress, uint8 _permissions) external onlyComplianceCall {
        _userPermissions[msg.sender][_userAddress] &= ~_permissions;
        emit PermissionsRevoked(msg.sender, _userAddress, _permissions);
    }

    /**
     *  @dev Grants one or more permissions to multiple users in a single call.
     *  @param _userAddresses  array of user addresses
     *  @param _permissions    bitmask of permissions to grant (use PERM_* constants)
     *  Only the bound Compliance smart contract can call this function.
     *  Emits a `PermissionsGranted` event for each address.
     */
    function batchGrantPermissions(address[] memory _userAddresses, uint8 _permissions) external onlyComplianceCall {
        uint256 length = _userAddresses.length;
        for (uint256 i = 0; i < length; i++) {
            address user = _userAddresses[i];
            _userPermissions[msg.sender][user] |= _permissions;
            emit PermissionsGranted(msg.sender, user, _permissions);
        }
    }

    /**
     *  @dev Revokes one or more permissions from multiple users in a single call.
     *  @param _userAddresses  array of user addresses
     *  @param _permissions    bitmask of permissions to revoke (use PERM_* constants)
     *  Only the bound Compliance smart contract can call this function.
     *  Emits a `PermissionsRevoked` event for each address.
     */
    function batchRevokePermissions(address[] memory _userAddresses, uint8 _permissions) external onlyComplianceCall {
        uint256 length = _userAddresses.length;
        for (uint256 i = 0; i < length; i++) {
            address user = _userAddresses[i];
            _userPermissions[msg.sender][user] &= ~_permissions;
            emit PermissionsRevoked(msg.sender, user, _permissions);
        }
    }

    /**
     *  @dev See {IModule-moduleTransferAction}.
     *  no transfer action required in this module
     */
    // solhint-disable-next-line no-empty-blocks
    function moduleTransferAction(address _from, address _to, uint256 _value) external onlyComplianceCall {}

    /**
     *  @dev See {IModule-moduleMintAction}.
     *  no mint action required in this module
     */
    // solhint-disable-next-line no-empty-blocks
    function moduleMintAction(address _to, uint256 _value) external onlyComplianceCall {}

    /**
     *  @dev See {IModule-moduleBurnAction}.
     *  no burn action required in this module
     */
    // solhint-disable-next-line no-empty-blocks
    function moduleBurnAction(address _from, uint256 _value) external onlyComplianceCall {}

    /**
     *  @dev See {IModule-moduleCheck}.
     *
     *  Transfer rules:
     *  - Burns  (_to == address(0)):   always allowed.
     *  - Mints  (_from == address(0)): _to must have PERM_CAN_RECEIVE_MINT.
     *  - Regular transfers:            _from must have PERM_CAN_SEND
     *                                  AND _to must have PERM_CAN_RECEIVE_FROM_ACCOUNT.
     */
    function moduleCheck(
        address _from,
        address _to,
        uint256 /*_value*/,
        address _compliance
    ) external view override returns (bool) {
        // Burns are always allowed
        if (_to == address(0)) {
            return true;
        }

        // Mint: only allowed recipients of minted tokens may receive
        if (_from == address(0)) {
            return _hasPermission(_compliance, _to, PERM_CAN_RECEIVE_MINT);
        }

        // Regular transfer: sender must be allowed to send AND recipient must be allowed to receive
        return _hasPermission(_compliance, _from, PERM_CAN_SEND)
            && _hasPermission(_compliance, _to, PERM_CAN_RECEIVE_FROM_ACCOUNT);
    }

    /**
     *  @dev Returns the full permission bitmask for a user under a given compliance.
     *  @param _compliance   the Compliance smart contract address
     *  @param _userAddress  the user address to query
     *  @return the uint8 bitmask of all permissions held by the user
     */
    function getUserPermissions(address _compliance, address _userAddress) external view returns (uint8) {
        return _userPermissions[_compliance][_userAddress];
    }

    /**
     *  @dev Returns whether a user holds a specific permission (or set of permissions).
     *  @param _compliance   the Compliance smart contract address
     *  @param _userAddress  the user address to query
     *  @param _permission   the permission bitmask to test (use PERM_* constants)
     *  @return true if the user has ALL bits in `_permission` set
     */
    function hasPermission(address _compliance, address _userAddress, uint8 _permission) external view returns (bool) {
        return _hasPermission(_compliance, _userAddress, _permission);
    }

    /**
     *  @dev See {IModule-canComplianceBind}.
     */
    function canComplianceBind(address /*_compliance*/) external view override returns (bool) {
        return true;
    }

    /**
     *  @dev See {IModule-isPlugAndPlay}.
     */
    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    /**
     *  @dev See {IModule-name}.
     */
    function name() public pure returns (string memory _name) {
        return "TransferRestrictModule";
    }

    /**
     *  @dev Returns true when ALL bits in `_permission` are set in the user's stored bitmask.
     */
    function _hasPermission(address _compliance, address _user, uint8 _permission) internal view returns (bool) {
        return (_userPermissions[_compliance][_user] & _permission) == _permission;
    }
}
