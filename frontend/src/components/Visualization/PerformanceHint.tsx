import React from 'react';
import { Alert, AlertTitle, Box, Typography, List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import { 
  TipsAndUpdates as TipIcon,
  QueryStats as AggregateIcon,
  FilterAlt as FilterIcon,
  DataUsage as SampleIcon,
  Speed as PerformanceIcon
} from '@mui/icons-material';

interface PerformanceHintProps {
  isVisible: boolean;
  queryType: 'large_continuous' | 'large_discrete' | 'slow_aggregation';
  rowCount?: number;
}

const PerformanceHint: React.FC<PerformanceHintProps> = ({ 
  isVisible, 
  queryType, 
  rowCount 
}) => {
  if (!isVisible) return null;

  const getTitle = () => {
    switch (queryType) {
      case 'large_continuous':
        return 'Large Continuous Data Detected';
      case 'large_discrete':
        return 'Large Discrete Data Detected';
      case 'slow_aggregation':
        return 'Slow Aggregation Query';
      default:
        return 'Performance Optimization Tips';
    }
  };

  const getDescription = () => {
    switch (queryType) {
      case 'large_continuous':
        return `Your query with continuous dimensions returned ${rowCount?.toLocaleString()} rows, which may cause performance issues.`;
      case 'large_discrete':
        return `Your query with discrete dimensions returned ${rowCount?.toLocaleString()} rows. Consider aggregation for better insights.`;
      case 'slow_aggregation':
        return 'Complex aggregations on large datasets can take time to process.';
      default:
        return 'Here are some tips to improve query performance.';
    }
  };

  const getRecommendations = () => {
    const recommendations = [
      {
        icon: <AggregateIcon />,
        primary: 'Use Aggregation',
        secondary: 'Convert dimensions to measures with sum, count, or average operations'
      },
      {
        icon: <FilterIcon />,
        primary: 'Add Filters',
        secondary: 'Reduce data size by filtering on date ranges, categories, or numeric ranges'
      }
    ];

    if (queryType === 'large_continuous') {
      recommendations.unshift({
        icon: <SampleIcon />,
        primary: 'Consider Sampling',
        secondary: 'For scatter plots with millions of points, sampling can maintain insights while improving performance'
      });
    }

    if (queryType === 'large_discrete') {
      recommendations.push({
        icon: <PerformanceIcon />,
        primary: 'Use Top N Filtering',
        secondary: 'Focus on the most important categories (e.g., top 50 products by sales)'
      });
    }

    return recommendations;
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Alert severity="info" icon={<TipIcon />}>
        <AlertTitle>{getTitle()}</AlertTitle>
        <Typography variant="body2" paragraph>
          {getDescription()}
        </Typography>
        
        <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
          💡 Performance Tips:
        </Typography>
        
        <List dense sx={{ mt: 1 }}>
          {getRecommendations().map((rec, index) => (
            <ListItem key={index} sx={{ pl: 0 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                {rec.icon}
              </ListItemIcon>
              <ListItemText
                primary={<Typography variant="body2" fontWeight="medium">{rec.primary}</Typography>}
                secondary={<Typography variant="caption">{rec.secondary}</Typography>}
              />
            </ListItem>
          ))}
        </List>
      </Alert>
    </Box>
  );
};

export default PerformanceHint; 