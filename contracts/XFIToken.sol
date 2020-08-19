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

    uint256 public constant override VESTING_DURATION = 182 days;

    /**
     * @dev Reserve is the final amount of tokens that weren't distributed
     * during the vesting.
     */
    uint256 public constant override RESERVE_FREEZE_PERIOD = 730 days; // Around 2 years.

    mapping (address => uint256) private _balances;

    mapping (address => mapping (address => uint256)) private _allowances;

    uint256 private _totalSupply;

    uint256 private _startDate;

    uint256 private _vestingDeadline;

    uint256 private _reserveFrozenUntil;

    bool private _stopped = false;

    /**
     * Sets {DEFAULT_ADMIN_ROLE} (alias `owner`) role for caller.
     * Assigns vesting and freeze period dates.
     */
    constructor (uint256 startDate_) public {
        require(startDate_ > block.timestamp, 'XFIToken: start date must be great than current timestamp');
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _startDate = startDate_;
        _vestingDeadline = startDate_.add(VESTING_DURATION);
        _reserveFrozenUntil = startDate_.add(RESERVE_FREEZE_PERIOD);
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
     * NOTE This method burns the absolute token amount ignoring the vesting
     * period.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     * - Caller must have minter role.
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     */
    function burnFrom(address account, uint256 amount) external override returns (bool) {
        require(hasRole(MINTER_ROLE, msg.sender), 'XFIToken: sender is not minter');
        require(account != address(0), 'XFIToken: burn from the zero address');
        require(!_stopped, 'XFIToken: transferring is stopped');
        require(_balances[account] >= amount, 'XFIToken: burn amount exceeds balance');

        _burn(account, amount);

        return true;
    }

    /**
     * Destroys `amount` tokens from sender, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     * - `account` must have at least `amount` tokens.
     * - `account` must have at least `amount` tokens.
     */
    function burn(uint256 amount) external override returns (bool) {
        require(!_stopped, 'XFIToken: transferring is stopped');
        require(balanceOf(msg.sender) >= amount, 'XFIToken: burn amount exceeds balance');

        _burn(msg.sender, amount);

        return true;
    }

    /**
     * Change start date and deadline timestamps.
     *
     * Emits a {StartDateChanged} event.
     *
     * Requirements:
     * - Caller must have owner role.
     * - Vesting must be pending.
     * - Deadline must be great than the current timestamp.
     */
     function changeStartDate(uint256 startDate_) external override returns (bool) {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'XFIToken: sender is not owner');
        require(_startDate > block.timestamp, 'XFIToken: vesting has started');
        require(startDate_ > block.timestamp, 'XFIToken: deadline must be great than current timestamp');

        _startDate = startDate_;
        _vestingDeadline = startDate_.add(VESTING_DURATION);
        _reserveFrozenUntil = startDate_.add(RESERVE_FREEZE_PERIOD);

        emit StartDateChanged(startDate_, _vestingDeadline, _reserveFrozenUntil);

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
      * - Contract isn't stopped.
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

         uint256 amount = getReserveAmount();

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
      * Returns the start date of the vesting.
      */
     function startDate() external view override returns (uint256) {
         return _startDate;
     }

     /**
      * Returns the vesting deadline.
      */
     function vestingDeadline() external view override returns (uint256) {
         return _vestingDeadline;
     }

     /**
      * Returns the vesting deadline of the reserve XFI amount.
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
         return amount
             .mul(daysSinceStart())
             .div(VESTING_DURATION.div(1 days));
     }

     /**
      * Convert input amount to the output amount using the vesting ratio
      * (days until vesting end / vesting duration).
      */
     function convertAmountUsingReverseRatio(uint256 amount) public view override returns (uint256) {
         return amount
             .mul(vestingEndsInDays())
             .div(VESTING_DURATION.div(1 days));
     }

     /**
      * Returns days since the vesting start.
      */
     function daysSinceStart() public view override returns (uint256) {
         if (block.timestamp > _startDate) {
             return block.timestamp
                 .sub(_startDate)
                 .div(1 days);
         } else {
             return 0;
         }
     }

     /**
      * Returns days until the vesting deadline.
      */
     function vestingEndsInDays() public view override returns (uint256) {
         if (block.timestamp < _vestingDeadline) {
             return _vestingDeadline
                 .sub(block.timestamp)
                 .div(1 days);
         } else {
             return 0;
         }
     }

     /**
      * Returns total supply of the token.
      */
     function totalSupply() public view override returns (uint256) {
         if (block.timestamp < _vestingDeadline) {
             return convertAmountUsingRatio(_totalSupply);
         } else {
             return _totalSupply;
         }
     }

     /**
      * Returns token balance of the `account`.
      */
     function balanceOf(address account) public view override returns (uint256) {
         if (block.timestamp < _vestingDeadline) {
             return convertAmountUsingRatio(_balances[account]);
         } else {
             return _balances[account];
         }
     }

     /**
      * Returns reserve amount.
      */
     function getReserveAmount() public view override returns (uint256) {
         return MAX_TOTAL_SUPPLY.sub(totalSupply());
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

        _balances[sender] = balanceOf(sender).sub(amount, 'XFIToken: transfer amount exceeds balance');
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

        _balances[account] = _balances[account].add(amount);

        emit Transfer(address(0), account, amount);
    }

    /**
     * Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     */
    function _burn(address account, uint256 amount) internal {
        _balances[account] = _balances[account].sub(amount);
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
}
