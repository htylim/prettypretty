export type RuntimeFlags = {
  verbose: boolean;
};

const VERBOSE_FLAGS = new Set(['-v', '--verbose']);

export const parseRuntimeFlags = (argv: string[] = process.argv): RuntimeFlags => {
  return {
    verbose: argv.some((argument) => VERBOSE_FLAGS.has(argument)),
  };
};
