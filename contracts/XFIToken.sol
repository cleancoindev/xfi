// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import './interfaces/IXFIToken.sol';

/**
 * Implementation of the {IXFIToken} interface.
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
 * allowances.
 */
contract XFIToken is AccessControl, ReentrancyGuard, IXFIToken {
    using SafeMath for uint256;
    using Address for address;

    string private constant _name = 'dfinance';

    string private constant _symbol = 'XFI';

    uint8 private constant _decimals = 18;

    bytes32 public constant MINTER_ROLE = keccak256('minter');

    uint256 public constant override MAX_TOTAL_SUPPLY = 1e26; // 100 million XFI.

    uint256 public constant override VESTING_DURATION_DAYS = 182;
    uint256 public constant override VESTING_DURATION = 182 days;

    /**
     * @dev Reserve is the final amount of tokens that weren't distributed
     * during the vesting.
     */
    uint256 public constant override RESERVE_FREEZE_DURATION_DAYS = 730; // Around 2 years.
    uint256 public constant override RESERVE_FREEZE_DURATION = 730 days;

    mapping (address => uint256) private _vestingBalances;

    mapping (address => uint256) private _balances;

    mapping (address => uint256) private _spentVestedBalances;

    mapping (address => mapping (address => uint256)) private _allowances;

    uint256 private _totalSupply;

    uint256 private _vestingStart;

    uint256 private _vestingEnd;

    uint256 private _reserveFrozenUntil;

    bool private _stopped = false;

    /**
     * Sets {DEFAULT_ADMIN_ROLE} (alias `owner`) role for caller.
     * Assigns vesting and freeze period dates.
     */
    constructor (uint256 vestingStart_) public {
        require(vestingStart_ > block.timestamp, 'XFIToken: vesting start must be greater than current timestamp');
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _vestingStart = vestingStart_;
        _vestingEnd = vestingStart_.add(VESTING_DURATION);
        _reserveFrozenUntil = vestingStart_.add(RESERVE_FREEZE_DURATION);
    }

    /**
     * Transfers `amount` tokens to `recipient`.
     *
     * Emits a {Transfer} event.
     *
     * Requirements:
     * - `recipient` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
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
     * - the caller must have allowance for `sender`'s tokens of at least
     * `amount`.
     */
    function transferFrom(address sender, address recipient, uint256 amount) external override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(sender, msg.sender, _allowances[sender][msg.sender].sub(amount, 'XFIToken: transfer amount exceeds allowance'));

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
        _approve(msg.sender, spender, _allowances[msg.sender][spender].sub(subtractedValue, 'XFIToken: decreased allowance below zero'));

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
     */
    function mint(address account, uint256 amount) external override returns (bool) {
        require(hasRole(MINTER_ROLE, msg.sender), 'XFIToken: sender is not minter');

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
     */
    function burnFrom(address account, uint256 amount) external override returns (bool) {
        require(hasRole(MINTER_ROLE, msg.sender), 'XFIToken: sender is not minter');

        _burn(account, amount);

        return true;
    }

    /**
     * Destroys `amount` tokens from sender, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     */
    function burn(uint256 amount) external override returns (bool) {
        _burn(msg.sender, amount);

        return true;
    }

    /**
     * Change vesting start and end timestamps.
     *
     * Emits a {VestingStartChanged} event.
     *
     * Requirements:
     * - Caller must have owner role.
     * - Vesting must be pending.
     * - `vestingStart_` must be greater than the current timestamp.
     */
     function changeVestingStart(uint256 vestingStart_) external override returns (bool) {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'XFIToken: sender is not owner');
        require(_vestingStart > block.timestamp, 'XFIToken: vesting has started');
        require(vestingStart_ > block.timestamp, 'XFIToken: vesting start must be greater than current timestamp');

        _vestingStart = vestingStart_;
        _vestingEnd = vestingStart_.add(VESTING_DURATION);
        _reserveFrozenUntil = vestingStart_.add(RESERVE_FREEZE_DURATION);

        emit VestingStartChanged(vestingStart_, _vestingEnd, _reserveFrozenUntil);

        return true;
     }

     /**
      * Starts all transfers.
      *
      * Emits a {TransfersStarted} event.
      *
      * Requirements:
      * - Caller must have owner role.
      * - Transferring is stopped.
      */
     function startTransfers() external override returns (bool) {
         require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), 'XFIToken: sender is not owner');
         require(_stopped, 'XFIToken: transferring is not stopped');

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
      * - Transferring isn't stopped.
      */
     function stopTransfers() external override returns (bool) {
         require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), 'XFIToken: sender is not owner');
         require(!_stopped, 'XFIToken: transferring is stopped');

         _stopped = true;

         emit TransfersStopped();

         return true;
     }

     /**
      * Withdraws reserve amount to a destination specified as `to`.
      *
      * Emits a {ReserveWithdrawal} event.
      *
      * Requirements:
      * - `to` cannot be the zero address.
      * - Caller must have owner role.
      * - Reserve has unfrozen.
      */
     function withdrawReserve(address to) external override nonReentrant returns (bool) {
         require(to != address(0), 'XFIToken: withdraw to the zero address');
         require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), 'XFIToken: sender is not owner');
         require(block.timestamp > _reserveFrozenUntil, 'XFIToken: reserve is frozen');

         uint256 amount = reserveAmount();

         _mint(to, amount);

         emit ReserveWithdrawal(to, amount);

         return true;
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
      * Returnes amount of `owner`'s tokens that `spender` is allowed to transfer.
      */
     function allowance(address owner, address spender) external view override returns (uint256) {
         return _allowances[owner][spender];
     }

     /**
      * Returns the vesting start.
      */
     function vestingStart() external view override returns (uint256) {
         return _vestingStart;
     }

     /**
      * Returns the vesting end.
      */
     function vestingEnd() external view override returns (uint256) {
         return _vestingEnd;
     }

     /**
      * Returns the date when freeze of the reserve XFI amount.
      */
     function reserveFrozenUntil() external view override returns (uint256) {
         return _reserveFrozenUntil;
     }

     /**
      * Returns whether transfering is stopped.
      */
     function isTransferringStopped() external view override returns (bool) {
         return _stopped;
     }

     /**
      * Convert input amount to the output amount using the vesting ratio
      * (days since vesting start / vesting duration).
      */
     function convertAmountUsingRatio(uint256 amount) public view override returns (uint256) {
         if (vestingDaysSinceStart() <= VESTING_DURATION_DAYS) {
             return amount
                 .mul(vestingDaysSinceStart())
                 .div(VESTING_DURATION_DAYS);
         } else {
             return amount;
         }
     }

     /**
      * Convert input amount to the output amount using the vesting reverse ratio
      * (days until vesting end / vesting duration).
      */
     function convertAmountUsingReverseRatio(uint256 amount) public view override returns (uint256) {
         if (vestingDaysSinceStart() > 0) {
             return amount
                 .mul(vestingDaysLeft())
                 .div(VESTING_DURATION_DAYS);
         } else {
             return amount;
         }
     }

     /**
      * Returns days since the vesting start.
      */
     function vestingDaysSinceStart() public view override returns (uint256) {
         if (block.timestamp > _vestingStart) {
             return block.timestamp
                 .sub(_vestingStart)
                 .div(1 days);
         } else {
             return 0;
         }
     }

     /**
      * Returns vesting days left.
      */
     function vestingDaysLeft() public view override returns (uint256) {
         if (block.timestamp < _vestingEnd) {
             return VESTING_DURATION_DAYS
                 .sub(vestingDaysSinceStart());
         } else {
             return 0;
         }
     }

     /**
      * Returns total supply of the token.
      */
     function totalSupply() public view override returns (uint256) {
         return convertAmountUsingRatio(_totalSupply);
     }

     /**
      * Returns total vested balance of the `account`.
      */
     function totalVestedBalanceOf(address account) public view override returns (uint256) {
         return convertAmountUsingRatio(_vestingBalances[account]);
     }

     /**
      * Returns unspent vested balance of the `account`.
      */
     function unspentVestedBalanceOf(address account) public view override returns (uint256) {
         return totalVestedBalanceOf(account)
            .sub(_spentVestedBalances[account]);
     }

     /**
      * Returns spent vested balance of the `account`.
      */
     function spentVestedBalanceOf(address account) public view override returns (uint256) {
         return _spentVestedBalances[account];
     }

     /**
      * Returns token balance of the `account`.
      */
     function balanceOf(address account) public view override returns (uint256) {
         return unspentVestedBalanceOf(account)
            .add(_balances[account]);
     }

     /**
      * Returns reserve amount.
      */
     function reserveAmount() public view override returns (uint256) {
         return MAX_TOTAL_SUPPLY
            .sub(totalSupply());
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
     * - Transferring is not stopped.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), 'XFIToken: transfer from the zero address');
        require(recipient != address(0), 'XFIToken: transfer to the zero address');
        require(!_stopped, 'XFIToken: transferring is stopped');

        _decreaseAccountBalance(sender, amount);

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
     * - Transferring is not stopped.
     * - Total supply doesn't exceed `MAX_TOTAL_SUPPLY`.
     */
    function _mint(address account, uint256 amount) internal {
        require(account != address(0), 'XFIToken: mint to the zero address');
        require(!_stopped, 'XFIToken: transferring is stopped');

        _totalSupply = _totalSupply.add(amount);

        require(_totalSupply <= MAX_TOTAL_SUPPLY, 'XFIToken: mint will result in exceeding total supply');

        _vestingBalances[account] = _vestingBalances[account].add(amount);

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
     * - Transferring is not stopped.
     * - `account` must have at least `amount` tokens.
     */
    function _burn(address account, uint256 amount) internal {
        require(account != address(0), 'XFIToken: burn from the zero address');
        require(!_stopped, 'XFIToken: transferring is stopped');
        require(balanceOf(account) >= amount, 'XFIToken: burn amount exceeds balance');

        _decreaseAccountBalance(account, amount);

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
        require(owner != address(0), 'XFIToken: approve from the zero address');
        require(spender != address(0), 'XFIToken: approve to the zero address');

        _allowances[owner][spender] = amount;

        emit Approval(owner, spender, amount);
    }

    /**
     * Decrease balance of the `account`.
     *
     * The use of vested balance is in priority. Otherwise, the normal balance
     * will be used.
     */
    function _decreaseAccountBalance(address account, uint256 amount) internal {
        uint256 accountBalance = balanceOf(account);

        require(accountBalance >= amount, 'XFIToken: transfer amount exceeds balance');

        uint256 accountVestedBalance = unspentVestedBalanceOf(account);
        uint256 usedVestedBalance = 0;
        uint256 usedBalance = 0;

        if (accountVestedBalance >= amount) {
            usedVestedBalance = amount;
        } else {
            usedVestedBalance = accountVestedBalance;
            usedBalance = amount.sub(usedVestedBalance);
        }

        _balances[account] = _balances[account].sub(usedBalance);
        _spentVestedBalances[account] = _spentVestedBalances[account].add(usedVestedBalance);
    }
}
