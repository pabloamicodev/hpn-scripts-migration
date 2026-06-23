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
  cost: CartCost;
  attributes: Array<CartAttribute>;
  buyerIdentity: CartBuyerIdentity;
};

export type CartLine = {
  __typename?: 'CartLine';
  id: Scalars['ID']['output'];
  merchandise: Merchandise;
  quantity: Scalars['Int']['output'];
  cost: CartLineCost;
  sellingPlanAllocation?: Maybe<SellingPlanAllocation>;
};

export type CartCost = {
  __typename?: 'CartCost';
  subtotalAmount: MoneyV2;
};

export type CartLineCost = {
  __typename?: 'CartLineCost';
  totalAmount: MoneyV2;
};

export type MoneyV2 = {
  __typename?: 'MoneyV2';
  amount: Scalars['Decimal']['output'];
  currencyCode: Scalars['String']['output'];
};

export type CartAttribute = {
  __typename?: 'CartAttribute';
  key: Scalars['String']['output'];
  value?: Maybe<Scalars['String']['output']>;
};

export type CartBuyerIdentity = {
  __typename?: 'CartBuyerIdentity';
  customer?: Maybe<Customer>;
  email?: Maybe<Scalars['String']['output']>;
  countryCode?: Maybe<Scalars['String']['output']>;
};

export type Customer = {
  __typename?: 'Customer';
  numberOfOrders: Scalars['Int']['output'];
  amountSpent: MoneyV2;
};

export type SellingPlanAllocation = {
  __typename?: 'SellingPlanAllocation';
  sellingPlan: SellingPlan;
};

export type SellingPlan = {
  __typename?: 'SellingPlan';
  id: Scalars['ID']['output'];
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
  tags: Array<Scalars['String']['output']>;
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

export type RunInputQuery = {
  __typename?: 'Input';
  cart: {
    __typename?: 'Cart';
    cost: { __typename?: 'CartCost'; subtotalAmount: { __typename?: 'MoneyV2'; amount: any; currencyCode: string } };
    attributes: Array<{ __typename?: 'CartAttribute'; key: string; value?: string | null }>;
    buyerIdentity: {
      __typename?: 'CartBuyerIdentity';
      email?: string | null;
      countryCode?: string | null;
      customer?: {
        __typename?: 'Customer';
        numberOfOrders: number;
        amountSpent: { __typename?: 'MoneyV2'; amount: any; currencyCode: string };
      } | null;
    };
    lines: Array<{
      __typename?: 'CartLine';
      id: string;
      quantity: number;
      cost: { __typename?: 'CartLineCost'; totalAmount: { __typename?: 'MoneyV2'; amount: any; currencyCode: string } };
      sellingPlanAllocation?: { __typename?: 'SellingPlanAllocation'; sellingPlan: { __typename?: 'SellingPlan'; id: string } } | null;
      merchandise: { __typename: 'ProductVariant'; id: string; product: { __typename?: 'Product'; id: string; tags: Array<string> } };
    }>;
  };
  discount: {
    __typename?: 'Discount';
    discountClasses: Array<DiscountClass>;
    metafield?: { __typename?: 'Metafield'; value: string } | null;
  };
};
