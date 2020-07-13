// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import './interfaces/IDFIToken.sol';

/**
 * Implementation of the {IDFIToken} interface.
 *
 * We have followed general OpenZeppelin guidelines: functions revert instead
 * of returning `false` on failure. This behavior is nonetheless conventional
 * and does not conflict with the expectations of ERC20 applications.
 *
 * Additionally, an {Approval} event is emitted on calls to {transferFrom}.
 * This allows applications to reconstruct the allowance for all accounts just
 * by listening to said events. Other implementations of the EIP may not emit
 * these events, as it isn't required by the specification.
 *
 * Finally, the non-standard {decreaseAllowance} and {increaseAllowance}
 * functions have been added to mitigate the well-known issues around setting
 * allowances. See {IERC20-approve}.
 */
contract DFIToken is AccessControl, IDFIToken {
    using SafeMath for uint256;
    using Address for address;

    mapping (address => uint256) private _balances;

    mapping (address => mapping (address => uint256)) private _allowances;

    uint256 private _totalSupply;

    string private constant _name = 'dfinance';
    string private constant _symbol = 'DFI';
    uint8 private constant _decimals = 18;

    bytes32 public constant MINTER_ROLE = keccak256('minter');

    bool private _stopped = false;

    /**
     * Sets {DEFAULT_ADMIN_ROLE} (alias `owner`) role for caller.
     */
    constructor () public {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Returns name of the token.
     */
    function name() external view override returns (string memory) {
        return _name;
    }

    /**
     * Returns symbol of the token.
     */
    function symbol() external view override returns (string memory) {
        return _symbol;
    }

    /**
     * Returns number of decimals of the token.
     */
    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    /**
     * Returns total supply of the token.
     */
    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }

    /**
     * Returns token balance of the `account`.
     */
    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    /**
     * Returns whether transfering is stopped.
     */
    function isTransferringStopped() external view override returns (bool) {
        return _stopped;
    }

    /**
     * Returnes amount of `owner` tokens that `spender` is allowed to transfer.
     */
    function allowance(address owner, address spender) external view override returns (uint256) {
        return _allowances[owner][spender];
    }

    /**
     * Transfers `amount` tokens to `recipient`.
     *
     * Emits a {Transfer} event.
     *
     * Requirements:
     * - `recipient` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     * - Contract isn't stopped.
     */
    function transfer(address recipient, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, recipient, amount);

        return true;
    }

    /**
     * Approves `spender` to spend `amount` of caller's tokens.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     * - `spender` cannot be the zero address.
     */
    function approve(address spender, uint256 amount) external override returns (bool) {
        _approve(msg.sender, spender, amount);

        return true;
    }

    /**
     * Transfers `amount` tokens from `sender` to `recipient`.
     *
     * Emits a {Transfer} event.
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     * - `sender` and `recipient` cannot be the zero address.
     * - `sender` must have a balance of at least `amount`.
     * - the caller must have allowance for ``sender``'s tokens of at least
     * `amount`.
     * - Contract isn't stopped.
     */
    function transferFrom(address sender, address recipient, uint256 amount) external override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(sender, msg.sender, _allowances[sender][msg.sender].sub(amount, 'DFIToken: transfer amount exceeds allowance'));

        return true;
    }

    /**
     * Atomically increases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     * - `spender` cannot be the zero address.
     */
    function increaseAllowance(address spender, uint256 addedValue) external override returns (bool) {
        _approve(msg.sender, spender, _allowances[msg.sender][spender].add(addedValue));

        return true;
    }

    /**
     * Atomically decreases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     * - `spender` cannot be the zero address.
     * - `spender` must have allowance for the caller of at least
     * `subtractedValue`.
     */
    function decreaseAllowance(address spender, uint256 subtractedValue) external override returns (bool) {
        _approve(msg.sender, spender, _allowances[msg.sender][spender].sub(subtractedValue, 'DFIToken: decreased allowance below zero'));

        return true;
    }

    /**
     * Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     * - Caller must have minter role.
     * - `account` cannot be the zero address.
     * - Contract isn't stopped.
     */
    function mint(address account, uint256 amount) external override returns (bool) {
        require(hasRole(MINTER_ROLE, msg.sender), 'DFIToken: sender is not minter');

        _mint(account, amount);

        return true;
    }

    /**
     * Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     * - Caller must have minter role.
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     * - Contract isn't stopped.
     */
    function burn(address account, uint256 amount) external override returns (bool) {
        require(hasRole(MINTER_ROLE, msg.sender), 'DFIToken: sender is not minter');

        _burn(account, amount);

        return true;
    }

    /**
     * Starts all transfers.
     *
     * Emits a {TransfersStarted} event.
     *
     * Requirements:
     * - Caller must have owner role.
     * - Contract is stopped.
     */
    function startTransfers() external override returns (bool) {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), 'DFIToken: sender is not owner');
        require(_stopped, 'DFIToken: transferring is not stopped');

        _stopped = false;

        emit TransfersStarted();

        return true;
    }

    /**
     * Stops all transfers.
     *
     * Emits a {TransfersStopped} event.
     *
     * Requirements:
     * - Caller must have owner role.
     * - Contract isn't stopped.
     */
    function stopTransfers() external override returns (bool) {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), 'DFIToken: sender is not owner');
        require(!_stopped, 'DFIToken: transferring is stopped');

        _stopped = true;

        emit TransfersStopped();

        return true;
    }

    /**
     * Moves tokens `amount` from `sender` to `recipient`.
     *
     * Emits a {Transfer} event.
     *
     * Requirements:
     * - `sender` cannot be the zero address.
     * - `recipient` cannot be the zero address.
     * - `sender` must have a balance of at least `amount`.
     * - Contract isn't stopped.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), 'DFIToken: transfer from the zero address');
        require(recipient != address(0), 'DFIToken: transfer to the zero address');
        require(!_stopped, 'DFIToken: transferring is stopped');

        _balances[sender] = _balances[sender].sub(amount, 'DFIToken: transfer amount exceeds balance');
        _balances[recipient] = _balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    /**
     * Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     * - `account` cannot be the zero address.
     * - Contract isn't stopped.
     */
    function _mint(address account, uint256 amount) internal {
        require(account != address(0), 'DFIToken: mint to the zero address');
        require(!_stopped, 'DFIToken: transferring is stopped');

        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);
        emit Transfer(address(0), account, amount);
    }

    /**
     * Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     * - Contract isn't stopped.
     */
    function _burn(address account, uint256 amount) internal {
        require(account != address(0), 'DFIToken: burn from the zero address');
        require(!_stopped, 'DFIToken: transferring is stopped');

        _balances[account] = _balances[account].sub(amount, 'DFIToken: burn amount exceeds balance');
        _totalSupply = _totalSupply.sub(amount);
        emit Transfer(account, address(0), amount);
    }

    /**
     * Sets `amount` as the allowance of `spender` over the `owner`s tokens.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     */
    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0), 'DFIToken: approve from the zero address');
        require(spender != address(0), 'DFIToken: approve to the zero address');

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}
