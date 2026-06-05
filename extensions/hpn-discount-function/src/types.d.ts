export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Decimal: { input: any; output: any; }
};

export type Cart = {
  __typename?: 'Cart';
  lines: Array<CartLine>;
};

export type CartLine = {
  __typename?: 'CartLine';
  id: Scalars['ID']['output'];
  merchandise: Merchandise;
  quantity: Scalars['Int']['output'];
};

export type CartLineTarget = {
  __typename?: 'CartLineTarget';
  id: Scalars['ID']['output'];
  quantity?: Maybe<Scalars['Int']['output']>;
};

export type Condition = {
  __typename?: 'Condition';
  field: ConditionField;
  operator: ConditionOperator;
  value: Scalars['String']['output'];
};

export enum ConditionField {
  CartLineQuantity = 'CART_LINE_QUANTITY',
  CartSubtotalAmount = 'CART_SUBTOTAL_AMOUNT',
  CartTotalQuantity = 'CART_TOTAL_QUANTITY'
}

export enum ConditionOperator {
  EqualTo = 'EQUAL_TO',
  GreaterThan = 'GREATER_THAN',
  GreaterThanOrEqualTo = 'GREATER_THAN_OR_EQUAL_TO',
  LessThan = 'LESS_THAN',
  LessThanOrEqualTo = 'LESS_THAN_OR_EQUAL_TO'
}

export type Discount = {
  __typename?: 'Discount';
  conditions?: Maybe<Array<Condition>>;
  message?: Maybe<Scalars['String']['output']>;
  targets: Array<Target>;
  value: Value;
};

export enum DiscountApplicationStrategy {
  All = 'ALL',
  First = 'FIRST',
  Maximum = 'MAXIMUM'
}

export type DiscountNode = {
  __typename?: 'DiscountNode';
  metafield?: Maybe<Metafield>;
};


export type DiscountNodeMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: Scalars['String']['input'];
};

export type FixedAmount = {
  __typename?: 'FixedAmount';
  amount: Scalars['Decimal']['output'];
  appliesToEachItem?: Maybe<Scalars['Boolean']['output']>;
};

export type FunctionRunResult = {
  __typename?: 'FunctionRunResult';
  discountApplicationStrategy: DiscountApplicationStrategy;
  discounts: Array<Discount>;
};

export type Input = {
  __typename?: 'Input';
  cart: Cart;
  discountNode: DiscountNode;
};

export type Merchandise = ProductVariant;

export type Metafield = {
  __typename?: 'Metafield';
  value: Scalars['String']['output'];
};

export type Percentage = {
  __typename?: 'Percentage';
  value: Scalars['Decimal']['output'];
};

export type Product = {
  __typename?: 'Product';
  id: Scalars['ID']['output'];
};

export type ProductVariant = {
  __typename?: 'ProductVariant';
  id: Scalars['ID']['output'];
  product: Product;
};

export type ProductVariantTarget = {
  __typename?: 'ProductVariantTarget';
  id: Scalars['ID']['output'];
  quantity?: Maybe<Scalars['Int']['output']>;
};

export type Target = CartLineTarget | ProductVariantTarget;

export type Value = FixedAmount | Percentage;

export type RunInputQueryVariables = Exact<{ [key: string]: never; }>;


export type RunInputQuery = { __typename?: 'Input', cart: { __typename?: 'Cart', lines: Array<{ __typename?: 'CartLine', id: string, quantity: number, merchandise: { __typename: 'ProductVariant', id: string, product: { __typename?: 'Product', id: string } } }> }, discountNode: { __typename?: 'DiscountNode', metafield?: { __typename?: 'Metafield', value: string } | null } };
