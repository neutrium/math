export declare class Decimal {
    private static readonly EXP_LIMIT;
    private static readonly MAX_DIGITS;
    private static readonly NUMERALS;
    private static readonly LN10_STR;
    private static readonly PI_STR;
    static readonly LN10: Decimal;
    static readonly PI: Decimal;
    private static readonly LN10_PRECISION;
    private static readonly PI_PRECISION;
    static precision: number;
    static readonly ROUND_UP: number;
    static readonly ROUND_DOWN: number;
    static readonly ROUND_CEIL: number;
    static readonly ROUND_FLOOR: number;
    static readonly ROUND_HALF_UP: number;
    static readonly ROUND_HALF_DOWN: number;
    static readonly ROUND_HALF_EVEN: number;
    static readonly ROUND_HALF_CEIL: number;
    static readonly ROUND_HALF_FLOOR: number;
    static readonly EUCLID: number;
    static rounding: number;
    static modulo: number;
    static toExpNeg: number;
    static toExpPos: number;
    static minE: number;
    static maxE: number;
    static external: boolean;
    static quadrant: any;
    private static decimalError;
    private static invalidArgument;
    private static precisionLimitExceeded;
    private static readonly isDecimal;
    private static readonly BASE;
    private static readonly LOG_BASE;
    private static readonly MAX_SAFE_INTEGER;
    d: number[];
    e: number;
    s: number;
    constructor(v: string | number | Decimal);
    abs(): Decimal;
    cbrt(): Decimal;
    ceil(): Decimal;
    cmp(w: string | number | Decimal): number;
    dp(): number;
    div(y: string | number | Decimal): Decimal;
    divToInt(y: string | number | Decimal): Decimal;
    eq(y: string | number | Decimal): boolean;
    exp(): Decimal;
    floor(): Decimal;
    gt(y: string | number | Decimal): boolean;
    gte(y: string | number | Decimal): boolean;
    isFinite(): boolean;
    isInt(): boolean;
    isNaN(): boolean;
    isNeg(): boolean;
    isPos(): boolean;
    isZero(): boolean;
    lt(y: string | number | Decimal): boolean;
    lte(y: string | number | Decimal): boolean;
    ln(): Decimal;
    log(baseN: number | string | Decimal): Decimal;
    log10(): Decimal;
    log2(): Decimal;
    max(values: any): Decimal;
    min(values: any): Decimal;
    sub(yy: number | string | Decimal): Decimal;
    mod(yy: number | string | Decimal): Decimal;
    neg(): Decimal;
    add(yy: number | string | Decimal): Decimal;
    precision(z?: boolean | number): number;
    round(): Decimal;
    sign(): number;
    mul(yy: number | string | Decimal): Decimal;
    toDP(dp?: number, rm?: number): Decimal;
    sqrt(): Decimal;
    toExponential(dp?: number, rm?: number): Decimal;
    toFixed(dp?: number, rm?: number): Decimal;
    toFraction(denominator: number | string | Decimal): Decimal;
    toNearest(yy: number | string | Decimal, rm?: number): Decimal;
    toNumber(): number;
    pow(yy: number | string | Decimal): Decimal;
    toPrecision(sd?: number, rm?: number): string;
    toSignificantDigits(sd?: number, rm?: number): Decimal;
    toString(): string;
    trunc(): Decimal;
    valueOf(): string;
    cos(): Decimal;
    acos(): Decimal;
    cosh(): Decimal;
    acosh(): Decimal;
    sin(): Decimal;
    asin(): Decimal;
    sinh(): Decimal;
    asinh(): Decimal;
    tan(): Decimal;
    atan(): Decimal;
    static atan2(yy: number | string | Decimal, xx: number | string | Decimal): Decimal;
    tanh(): Decimal;
    atanh(): Decimal;
    private toLessThanHalfPi(x);
    private sine(x);
    private cosine(x);
    private taylorSeries(n, x, y, isHyperbolic?);
    private static digitsToString(d);
    private checkInt32(i, min, max);
    private static checkRoundingDigits(d, i, rm, repeating?);
    private static divide(x, y, pr?, rm?, dp?, base?);
    private static finalise(x, sd?, rm?, isTruncated?);
    private finiteToString(x, isExp?, sd?);
    private getBase10Exponent(digits, e);
    private getLn10(sd, pr?);
    private static getPi(sd, rm);
    private getPrecision(digits);
    private static getZeroString(k);
    private intPow(x, n, pr);
    private isOdd(n);
    private maxOrMin(values, ltgt);
    private static naturalExponential(x, sd?);
    private naturalLogarithm(y, sd?);
    private nonFiniteToString(x);
    private parseDecimal(x, str);
    private parseOther(x, str);
    private truncate(arr, len);
    static config(obj: any): typeof Decimal;
}
