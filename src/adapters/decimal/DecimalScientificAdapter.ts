import { mergeDefined } from '@neutrium/utilities/configuration';
import { Decimal, type DecimalConfigInput } from '@neutrium/decimal/scientific';
import type { ScientificAdapter } from '../contracts/ScientificAdapter.js';
import { DecimalArithmeticAdapter } from './DecimalArithmeticAdapter.js';
import { literal } from '../../numeric/literal.js';

/** Isolated Decimal scientific context, inheriting core and arithmetic operations. */
export class DecimalScientificAdapter extends DecimalArithmeticAdapter<typeof Decimal, 'scientific'> implements ScientificAdapter<Decimal>
{
	/** Capture current scientific defaults and apply isolated overrides. */
	constructor(options: DecimalConfigInput = {})
	{
		super(options, Decimal, 'scientific');
	}

	/** Create an independent scientific adapter with updated settings. */
	override withConfig(options: DecimalConfigInput): DecimalScientificAdapter
	{
		const adapter = new DecimalScientificAdapter(mergeDefined(this.config, options));
		Object.freeze(adapter);
		return adapter;
	}

	/** Decimal sqrt operation using this context's settings. */
	sqrt(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).sqrt());
	}

	/** Decimal cbrt operation using this context's settings. */
	cbrt(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).cbrt());
	}

	/** Decimal exp operation using this context's settings. */
	exp(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).exp());
	}

	/** Decimal ln operation using this context's settings. */
	ln(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).ln());
	}

	/** Decimal sin operation using this context's settings. */
	sin(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).sin());
	}

	/** Decimal cos operation using this context's settings. */
	cos(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).cos());
	}

	/** Decimal tan operation using this context's settings. */
	tan(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).tan());
	}

	/** Decimal asin operation using this context's settings. */
	asin(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).asin());
	}

	/** Decimal acos operation using this context's settings. */
	acos(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).acos());
	}

	/** Decimal atan operation using this context's settings. */
	atan(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).atan());
	}

	/** Decimal sinh operation using this context's settings. */
	sinh(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).sinh());
	}

	/** Decimal cosh operation using this context's settings. */
	cosh(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).cosh());
	}

	/** Decimal tanh operation using this context's settings. */
	tanh(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).tanh());
	}

	/** Decimal asinh operation using this context's settings. */
	asinh(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).asinh());
	}

	/** Decimal acosh operation using this context's settings. */
	acosh(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).acosh());
	}

	/** Decimal atanh operation using this context's settings. */
	atanh(value: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).atanh());
	}

	/** Raise a scalar to an exponent, preserving its original literal. */
	pow(value: Decimal, exponent: string | number | bigint | Decimal): Decimal
	{
		const { core, operand, result } = this.context;
		return result(operand(value).pow(core.isValue(exponent) ? exponent : literal(exponent)));
	}

	/** Logarithm to the supplied base. */
	log(value: Decimal, base: Decimal): Decimal
	{
		const { operand, result } = this.context;
		return result(operand(value).log(operand(base)));
	}

	/** Two-argument arctangent in radians. */
	atan2(y: Decimal, x: Decimal): Decimal
	{
		const { operand, result, Work } = this.context;
		return result(Work.atan2(operand(y), operand(x)));
	}

	/** Pi at this context's precision. */
	pi(): Decimal
	{
		return this.context.result(this.context.Work.PI);
	}
}
