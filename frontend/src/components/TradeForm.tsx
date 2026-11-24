import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';

export type TradeType = 'BUY' | 'SELL';

export interface NewTrade {
  instrument: string;
  type: TradeType;
  quantity: string;
  unit_price: string;
  trade_date: string;
}

type TradeErrors = Partial<Record<keyof NewTrade, string>>;
type TradeField = keyof NewTrade;

interface TradeFormProps {
  currency: string;
  onSubmit: (trade: NewTrade) => Promise<void>;
}

function getTodayInNairobi(): string {
  const parts = new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '2026';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function createEmptyTrade(): NewTrade {
  return {
    instrument: '',
    type: 'BUY',
    quantity: '',
    unit_price: '',
    trade_date: getTodayInNairobi(),
  };
}

function positiveDecimalError(value: string, fieldName: string): string | undefined {
  if (!/^\d+(?:\.\d*)?$/.test(value)) {
    return 'Enter a positive number.';
  }
  const [integerPart, fractionalPart = ''] = value.split('.');
  if (integerPart.replace(/^0+/, '').length > 12) {
    return 'Use no more than 12 digits before the decimal point.';
  }
  if (fractionalPart.length > 6) {
    return 'Use no more than 6 decimal places.';
  }
  if (!Number.isFinite(Number(value))) {
    return 'Enter a finite number.';
  }
  if (Number(value) <= 0) {
    return `Enter a ${fieldName} greater than zero.`;
  }
  return undefined;
}

function validateTrade(trade: NewTrade): TradeErrors {
  const errors: TradeErrors = {};
  const instrument = trade.instrument.trim().toUpperCase();
  if (!instrument) {
    errors.instrument = 'Enter an instrument symbol, such as SCOM.';
  } else if (!/^[A-Z0-9][A-Z0-9.-]{0,15}$/.test(instrument)) {
    errors.instrument = 'Use up to 16 letters, numbers, dots, or hyphens.';
  }

  const quantityError = positiveDecimalError(trade.quantity, 'quantity');
  if (quantityError) errors.quantity = quantityError;

  const priceError = positiveDecimalError(trade.unit_price, 'unit price');
  if (priceError) errors.unit_price = priceError;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trade.trade_date)) {
    errors.trade_date = 'Choose a valid trade date.';
  } else {
    const parsedDate = new Date(`${trade.trade_date}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== trade.trade_date) {
      errors.trade_date = 'Choose a valid trade date.';
    }
  }

  return errors;
}

export function TradeForm({ currency, onSubmit }: TradeFormProps) {
  const [trade, setTrade] = useState<NewTrade>(createEmptyTrade);
  const [errors, setErrors] = useState<TradeErrors>({});
  const [requestError, setRequestError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isPending, setIsPending] = useState(false);
  const fieldRefs = useRef<Partial<Record<TradeField, HTMLInputElement | HTMLSelectElement>>>({});

  function updateField(field: TradeField, event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const value = event.currentTarget.value;
    setTrade((currentTrade) => ({ ...currentTrade, [field]: value }));
    setErrors((currentErrors) => ({ ...currentErrors, [field]: undefined }));
    setRequestError('');
    setSuccessMessage('');
  }

  function submitTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError('');
    setSuccessMessage('');

    const validationErrors = validateTrade(trade);
    setErrors(validationErrors);
    const firstInvalidField = (Object.keys(validationErrors) as TradeField[])[0];
    if (firstInvalidField) {
      window.requestAnimationFrame(() => fieldRefs.current[firstInvalidField]?.focus());
      return;
    }

    const normalizedTrade: NewTrade = {
      ...trade,
      instrument: trade.instrument.trim().toUpperCase(),
    };
    setIsPending(true);
    void onSubmit(normalizedTrade)
      .then(() => {
        setTrade(createEmptyTrade());
        setErrors({});
        setSuccessMessage('Trade recorded.');
      })
      .catch((error: unknown) => {
        setRequestError(
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Unable to save this trade. Check your connection and try again.',
        );
      })
      .finally(() => setIsPending(false));
  }

  function fieldError(field: TradeField) {
    return errors[field] ? (
      <p id={`${field}-error`} className="field-error">{errors[field]}</p>
    ) : null;
  }

  return (
    <form className="trade-form" onSubmit={submitTrade} noValidate>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Transaction</p>
          <h2>Record a trade</h2>
        </div>
        <p className="muted-text">All prices are in {currency}.</p>
      </div>

      <div className="trade-form-grid">
        <div className="field-group">
          <label htmlFor="trade-instrument">Instrument</label>
          <input
            id="trade-instrument"
            name="instrument"
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
            value={trade.instrument}
            onChange={(event) => updateField('instrument', event)}
            aria-invalid={Boolean(errors.instrument)}
            aria-describedby={errors.instrument ? 'instrument-error' : undefined}
            ref={(node) => { fieldRefs.current.instrument = node ?? undefined; }}
            placeholder="SCOM"
            disabled={isPending}
          />
          {fieldError('instrument')}
        </div>

        <div className="field-group">
          <label htmlFor="trade-type">Trade type</label>
          <select
            id="trade-type"
            name="type"
            value={trade.type}
            onChange={(event) => updateField('type', event)}
            disabled={isPending}
          >
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="trade-quantity">Quantity</label>
          <input
            id="trade-quantity"
            name="quantity"
            type="number"
            inputMode="decimal"
            min="0.000001"
            max="999999999999.999999"
            step="0.000001"
            value={trade.quantity}
            onChange={(event) => updateField('quantity', event)}
            aria-invalid={Boolean(errors.quantity)}
            aria-describedby={errors.quantity ? 'quantity-error' : undefined}
            ref={(node) => { fieldRefs.current.quantity = node ?? undefined; }}
            placeholder="100"
            disabled={isPending}
          />
          {fieldError('quantity')}
        </div>

        <div className="field-group">
          <label htmlFor="trade-unit-price">Unit price</label>
          <input
            id="trade-unit-price"
            name="unit_price"
            type="number"
            inputMode="decimal"
            min="0.000001"
            max="999999999999.999999"
            step="0.000001"
            value={trade.unit_price}
            onChange={(event) => updateField('unit_price', event)}
            aria-invalid={Boolean(errors.unit_price)}
            aria-describedby={errors.unit_price ? 'unit_price-error' : undefined}
            ref={(node) => { fieldRefs.current.unit_price = node ?? undefined; }}
            placeholder="125.50"
            disabled={isPending}
          />
          {fieldError('unit_price')}
        </div>

        <div className="field-group">
          <label htmlFor="trade-date">Trade date</label>
          <input
            id="trade-date"
            name="trade_date"
            type="date"
            value={trade.trade_date}
            onChange={(event) => updateField('trade_date', event)}
            aria-invalid={Boolean(errors.trade_date)}
            aria-describedby={errors.trade_date ? 'trade_date-error' : undefined}
            ref={(node) => { fieldRefs.current.trade_date = node ?? undefined; }}
            disabled={isPending}
          />
          {fieldError('trade_date')}
        </div>
      </div>

      <div className="trade-form-actions">
        <p className="field-hint">Use positive quantities and prices with up to 6 decimal places.</p>
        <button type="submit" className="button button-primary" disabled={isPending} aria-busy={isPending}>
          {isPending ? 'Saving…' : 'Record Trade'}
        </button>
      </div>
      {requestError ? <p className="form-message form-message-error" role="alert">{requestError}</p> : null}
      {successMessage ? <p className="form-message form-message-success" role="status" aria-live="polite">{successMessage}</p> : null}
    </form>
  );
}
