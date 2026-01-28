import { useState, useCallback } from 'react';
import { ValidationRule, ValidationResult, PluginResult } from '../types';

export const useCodeValidation = (validators: ValidationRule[]) => {
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [isValid, setIsValid] = useState(false);

  const validate = useCallback(
    (code: string, pluginOutput?: PluginResult): boolean => {
      const results = validators.map((validator) => {
        return validator.check({ code, pluginOutput });
      });

      setValidationResults(results);

      const allValid = results.every((r) => r.valid);
      setIsValid(allValid);

      return allValid;
    },
    [validators]
  );

  const reset = useCallback(() => {
    setValidationResults([]);
    setIsValid(false);
  }, []);

  return { validate, validationResults, isValid, reset };
};
