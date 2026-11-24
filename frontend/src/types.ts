export type TradeType = 'BUY' | 'SELL';

export interface Credentials {
  username: string;
  password: string;
}

export interface Analyst {
  id: number;
  username: string;
}

export interface AccessToken {
  access_token: string;
  token_type: 'bearer';
}

export interface PortfolioInput {
  name: string;
  client_name: string;
  base_currency: string;
}

export interface Portfolio extends PortfolioInput {
  id: number;
  created_at: string;
}

export interface TransactionInput {
  instrument: string;
  type: TradeType;
  quantity: string;
  unit_price: string;
  trade_date: string;
}

export interface Transaction extends TransactionInput {
  id: number;
  portfolio_id: number;
  created_at: string;
}

export interface PositionSummary {
  instrument: string;
  net_quantity: string;
  average_cost: string;
  total_invested: string;
  valuation_price: string;
  total_value: string;
}

export interface PortfolioSummary {
  portfolio_id: number;
  base_currency: string;
  positions: PositionSummary[];
  total_invested: string;
  total_value: string;
}
