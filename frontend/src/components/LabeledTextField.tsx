import React from 'react';
import { Stack, Typography } from '@mui/material';
import CustomTextField from './CustomTextField';
import { TextFieldProps } from '@mui/material/TextField';
import { InputBaseProps } from '@mui/material/InputBase';

// We accept most TextFieldProps for developer convenience when using the component,
// but we will manually strip out the props that are not valid for InputBase.
export type LabeledTextFieldProps = Omit<TextFieldProps, 'variant'> & {
  label: string;
};

const LabeledTextField: React.FC<LabeledTextFieldProps> = ({
  label,
  // Destructure to remove props that are part of TextFieldProps but not InputBaseProps.
  select,
  SelectProps,
  helperText,
  FormHelperTextProps,
  InputLabelProps,
  InputProps, // We don't use this wrapper with a custom input.
  margin,
  multiline,
  rows,
  maxRows,
  minRows,
  // The rest of the props should be compatible with InputBase.
  ...inputBaseProps
}) => {
  return (
    <Stack spacing={0.5} sx={{ width: '100%' }}>
      <Typography 
        variant="subtitle2" 
        color="text.secondary" 
        sx={{ textAlign: 'left', fontWeight: 500, pl: 0.5 }}
      >
        {label}
      </Typography>
      {/* 
        We cast the remaining props to InputBaseProps. 
        This is now safe because we have removed the incompatible ones.
      */}
      <CustomTextField {...(inputBaseProps as InputBaseProps)} />
    </Stack>
  );
};

export default LabeledTextField;
