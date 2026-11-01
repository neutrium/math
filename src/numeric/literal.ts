/** @internal Strict shared scalar syntax, without object-to-string coercion. */
export function literal(value: unknown): string | number | bigint
{
	if (typeof value === 'number' || typeof value === 'bigint')
	{
		return value;
	}

	if (typeof value !== 'string')
	{
		throw new TypeError('Expected a numeric scalar');
	}

	const text = value.trim();

	if (!/^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[+-]?Infinity|NaN)$/.test(text))
	{
		throw new TypeError('Expected a decimal numeric literal');
	}

	return text.startsWith('+') ? text.slice(1) : text;
}
