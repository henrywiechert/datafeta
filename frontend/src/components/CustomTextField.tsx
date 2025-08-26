import { styled, InputBase, InputBaseProps } from '@mui/material';

const CustomTextField = styled((props: InputBaseProps) => (
  <InputBase {...props} />
))(({ theme }) => ({
  'label + &': {
    marginTop: theme.spacing(3),
  },
  '& .MuiInputBase-input': {
    borderRadius: 8,
    position: 'relative',
    backgroundColor: theme.palette.mode === 'light' ? '#fcfcfb' : '#2b2b2b',
    border: '1px solid #ced4da',
    fontFamily: 'Montserrat, sans-serif',
    borderColor: theme.palette.divider,
    fontSize: 14,
    width: '100%',
    padding: '8px 10px',
    transition: theme.transitions.create([
      'border-color',
      'background-color',
    ]),
    '&:focus': {
      boxShadow: `${theme.palette.primary.main} 0 0 0 0.2rem`,
      borderColor: theme.palette.primary.main,
    },
  },
}));

export default CustomTextField;
