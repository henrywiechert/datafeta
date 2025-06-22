import React from 'react';
import { 
  Box, 
  IconButton, 
  Tooltip, 
  Divider,
  ButtonGroup,
  Button
} from '@mui/material';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import SettingsIcon from '@mui/icons-material/Settings';
import TableViewIcon from '@mui/icons-material/TableView';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useLayout } from '../../contexts/LayoutContext';

interface PanelToolbarProps {
  onResetLayout?: () => void;
}

const PanelToolbar: React.FC<PanelToolbarProps> = ({ onResetLayout }) => {
  const { layoutState, togglePanel, resetLayout } = useLayout();

  const handleResetLayout = () => {
    resetLayout();
    onResetLayout?.();
  };

  const panelButtons = [
    {
      id: 'fields',
      icon: <ViewSidebarIcon />,
      tooltip: 'Toggle Fields Panel',
      label: 'Fields'
    },
    {
      id: 'properties',
      icon: <SettingsIcon />,
      tooltip: 'Toggle Properties Panel',
      label: 'Properties'
    },
    {
      id: 'dataPreview',
      icon: <TableViewIcon />,
      tooltip: 'Toggle Data Preview Panel',
      label: 'Data Preview'
    },
    {
      id: 'filters',
      icon: <FilterListIcon />,
      tooltip: 'Toggle Filters Panel',
      label: 'Filters'
    }
  ];

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 1,
      p: 1,
      borderBottom: 1,
      borderColor: 'divider',
      backgroundColor: 'background.paper'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {panelButtons.map((button) => (
          <Tooltip key={button.id} title={button.tooltip}>
            <IconButton
              size="small"
              onClick={() => togglePanel(button.id)}
              color={layoutState.panels[button.id]?.visible ? 'primary' : 'default'}
              sx={{
                backgroundColor: layoutState.panels[button.id]?.visible ? 'primary.50' : 'transparent',
                '&:hover': {
                  backgroundColor: layoutState.panels[button.id]?.visible ? 'primary.100' : 'action.hover',
                }
              }}
            >
              {button.icon}
            </IconButton>
          </Tooltip>
        ))}
      </Box>

      <Divider orientation="vertical" flexItem />

      <Button
        size="small"
        variant="outlined"
        onClick={handleResetLayout}
        sx={{ fontSize: '0.75rem' }}
      >
        Reset Layout
      </Button>

      <Box sx={{ flexGrow: 1 }} />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
          Panels: {Object.values(layoutState.panels).filter(p => p.visible).length}
        </Box>
      </Box>
    </Box>
  );
};

export default PanelToolbar; 