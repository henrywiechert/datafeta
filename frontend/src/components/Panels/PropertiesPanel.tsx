import React from 'react';
import { 
  Box, 
  Typography, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Switch, 
  FormControlLabel,
  Slider,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface PropertiesPanelProps {
  // You can pass chart configuration or selected field properties here
  selectedChart?: string;
  onChartTypeChange?: (chartType: string) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ 
  selectedChart = 'bar',
  onChartTypeChange 
}) => {
  const [showLegend, setShowLegend] = React.useState(true);
  const [chartOpacity, setChartOpacity] = React.useState(80);
  const [animationSpeed, setAnimationSpeed] = React.useState(500);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Chart Type Selection */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Chart Type</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <FormControl fullWidth size="small">
            <InputLabel>Chart Type</InputLabel>
            <Select 
              value={selectedChart} 
              label="Chart Type"
              onChange={(e) => onChartTypeChange?.(e.target.value)}
            >
              <MenuItem value="bar">Bar Chart</MenuItem>
              <MenuItem value="line">Line Chart</MenuItem>
              <MenuItem value="scatter">Scatter Plot</MenuItem>
              <MenuItem value="pie">Pie Chart</MenuItem>
              <MenuItem value="area">Area Chart</MenuItem>
            </Select>
          </FormControl>
        </AccordionDetails>
      </Accordion>

      {/* Chart Appearance */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Appearance</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControlLabel
              control={
                <Switch 
                  checked={showLegend}
                  onChange={(e) => setShowLegend(e.target.checked)}
                />
              }
              label="Show Legend"
            />
            
            <Box>
              <Typography variant="body2" gutterBottom>
                Opacity: {chartOpacity}%
              </Typography>
              <Slider
                value={chartOpacity}
                onChange={(_, value) => setChartOpacity(value as number)}
                min={10}
                max={100}
                size="small"
              />
            </Box>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Animation Settings */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Animation</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box>
            <Typography variant="body2" gutterBottom>
              Animation Speed: {animationSpeed}ms
            </Typography>
            <Slider
              value={animationSpeed}
              onChange={(_, value) => setAnimationSpeed(value as number)}
              min={0}
              max={2000}
              step={100}
              size="small"
              marks={[
                { value: 0, label: 'None' },
                { value: 500, label: 'Fast' },
                { value: 1000, label: 'Normal' },
                { value: 2000, label: 'Slow' }
              ]}
            />
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Color Scheme */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Colors</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <FormControl fullWidth size="small">
            <InputLabel>Color Scheme</InputLabel>
            <Select defaultValue="default" label="Color Scheme">
              <MenuItem value="default">Default</MenuItem>
              <MenuItem value="blue">Blue Theme</MenuItem>
              <MenuItem value="green">Green Theme</MenuItem>
              <MenuItem value="purple">Purple Theme</MenuItem>
              <MenuItem value="custom">Custom</MenuItem>
            </Select>
          </FormControl>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default PropertiesPanel; 