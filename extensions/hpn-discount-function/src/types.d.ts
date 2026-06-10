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

export type CartLinesDiscountsGenerateRunResult = {
  __typename?: 'CartLinesDiscountsGenerateRunResult';
  operations: Array<CartOperation>;
};

export type CartOperation = ProductDiscountsAddOperation;

export type Discount = {
  __typename?: 'Discount';
  discountClasses: Array<DiscountClass>;
  metafield?: Maybe<Metafield>;
};


export type DiscountMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: Scalars['String']['input'];
};

export enum DiscountClass {
  Order = 'ORDER',
  Product = 'PRODUCT',
  Shipping = 'SHIPPING'
}

export type Input = {
  __typename?: 'Input';
  cart: Cart;
  discount: Discount;
};

export type Merchandise = ProductVariant;

export type Metafield = {
  __typename?: 'Metafield';
  value: Scalars['String']['output'];
};

export type Product = {
  __typename?: 'Product';
  id: Scalars['ID']['output'];
};

export type ProductDiscountCandidate = {
  __typename?: 'ProductDiscountCandidate';
  message?: Maybe<Scalars['String']['output']>;
  targets: Array<ProductDiscountCandidateTarget>;
  value: ProductDiscountCandidateValue;
};

export type ProductDiscountCandidateCartLine = {
  __typename?: 'ProductDiscountCandidateCartLine';
  id: Scalars['ID']['output'];
  quantity?: Maybe<Scalars['Int']['output']>;
};

export type ProductDiscountCandidateCartLineTarget = {
  __typename?: 'ProductDiscountCandidateCartLineTarget';
  cartLine: ProductDiscountCandidateCartLine;
};

export type ProductDiscountCandidatePercentage = {
  __typename?: 'ProductDiscountCandidatePercentage';
  percentage: ProductDiscountCandidatePercentageValue;
};

export type ProductDiscountCandidatePercentageValue = {
  __typename?: 'ProductDiscountCandidatePercentageValue';
  value: Scalars['Decimal']['output'];
};

export type ProductDiscountCandidateTarget = ProductDiscountCandidateCartLineTarget;

export type ProductDiscountCandidateValue = ProductDiscountCandidatePercentage;

export enum ProductDiscountSelectionStrategy {
  All = 'ALL',
  First = 'FIRST',
  Maximum = 'MAXIMUM'
}

export type ProductDiscountsAdd = {
  __typename?: 'ProductDiscountsAdd';
  candidates: Array<ProductDiscountCandidate>;
  selectionStrategy: ProductDiscountSelectionStrategy;
};

export type ProductDiscountsAddOperation = {
  __typename?: 'ProductDiscountsAddOperation';
  productDiscountsAdd: ProductDiscountsAdd;
};

export type ProductVariant = {
  __typename?: 'ProductVariant';
  id: Scalars['ID']['output'];
  product: Product;
};

export type RunInputQueryVariables = Exact<{ [key: string]: never; }>;


export type RunInputQuery = { __typename?: 'Input', cart: { __typename?: 'Cart', lines: Array<{ __typename?: 'CartLine', id: string, quantity: number, merchandise: { __typename: 'ProductVariant', id: string, product: { __typename?: 'Product', id: string } } }> }, discount: { __typename?: 'Discount', discountClasses: Array<DiscountClass>, metafield?: { __typename?: 'Metafield', value: string } | null } };
