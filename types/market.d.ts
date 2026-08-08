export interface MarketData {
  marketData: Market
  timestamp: number
}

export interface Market {
  [hrid: string]: MarketItem
}

export interface MarketItem {
  [level: string]: MarketItemPrice
}

export interface MarketItemPrice {
  ask: number
  bid: number
  /** marketplace.json: p (average) */
  avg?: number
  /** marketplace.json: v (volume) */
  vol?: number
}

export interface MarketDataPlain {
  marketData: {
    [hrid: string]: {
      [level: string]: {
        /** ask */
        a?: number
        /** bid */
        b?: number
        /** average */
        p?: number
        /** volume */
        v?: number
      }
    }
  }
  timestamp: number
}
