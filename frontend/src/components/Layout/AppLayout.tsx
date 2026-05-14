// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, Drawer, Typography } from '@mui/material';
import { useLayout } from '../../contexts/LayoutContext';
import ResizeHandle from './ResizeHandle';

interface Panel {
  id: string;
  title: string;
  content: React.ReactNode;
  width?: number;
  position?: 'left' | 'right' | 'bottom';
  collapsible?: boolean;
}

interface AppLayoutProps {
  children: React.ReactNode;
  panels?: Panel[];
  topBar?: React.ReactNode;
  title?: string;
}

const DRAWER_WIDTH = 300;

export const AppLayout: React.FC<AppLayoutProps> = ({ 
  children, 
  panels = [], 
  topBar,
  title = "DataFeta"
}) => {
  const { resizePanel } = useLayout();

  // Separate panels by position
  const leftPanels = panels.filter(p => p.position === 'left' || !p.position);
  const rightPanels = panels.filter(p => p.position === 'right');
  const bottomPanels = panels.filter(p => p.position === 'bottom');

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      {/* Left Panels */}
      {leftPanels.map((panel, index) => (
        <Box key={panel.id} sx={{ display: 'flex' }}>
          <Drawer
            variant="permanent"
            sx={{
              width: panel.width || DRAWER_WIDTH,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: panel.width || DRAWER_WIDTH,
                boxSizing: 'border-box',
                position: 'relative',
                height: '100%',
              },
            }}
          >
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="h6" component="h2">
                {panel.title}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {panel.content}
            </Box>
          </Drawer>
          {/* Resize handle for left panels */}
          <ResizeHandle 
            direction="horizontal"
            edge="right"
            currentSize={panel.width || DRAWER_WIDTH}
            onResize={(newSize) => {
              resizePanel(panel.id, newSize);
            }}
          />
        </Box>
      ))}

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Top Bar */}
        {topBar && (
          <Box sx={{ 
            borderBottom: 1, 
            borderColor: 'divider',
            backgroundColor: 'background.paper',
            zIndex: 1,
          }}>
            {topBar}
          </Box>
        )}

        {/* Main Content */}
        <Box sx={{ 
          flex: 1, 
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {children}
          
          {/* Bottom Panels */}
          {bottomPanels.map((panel, index) => (
            <Box key={panel.id}>
              {/* Resize handle for bottom panels */}
              <ResizeHandle 
                direction="vertical"
                edge="top"
                currentSize={panel.width || 200}
                onResize={(newSize) => {
                  resizePanel(panel.id, newSize);
                }}
              />
              <Box
                sx={{
                  height: panel.width || 200,
                  borderTop: 1,
                  borderColor: 'divider',
                  backgroundColor: 'background.paper',
                  overflow: 'auto',
                }}
              >
                <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="subtitle1">
                    {panel.title}
                  </Typography>
                </Box>
                <Box sx={{ p: 2 }}>
                  {panel.content}
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Right Panels */}
      {rightPanels.map((panel, index) => (
        <Box key={panel.id} sx={{ display: 'flex' }}>
          {/* Resize handle for right panels */}
          <ResizeHandle 
            direction="horizontal"
            edge="left"
            currentSize={panel.width || DRAWER_WIDTH}
            onResize={(newSize) => {
              resizePanel(panel.id, newSize);
            }}
          />
          <Drawer
            variant="permanent"
            anchor="right"
            sx={{
              width: panel.width || DRAWER_WIDTH,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: panel.width || DRAWER_WIDTH,
                boxSizing: 'border-box',
                position: 'relative',
                height: '100%',
              },
            }}
          >
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="h6" component="h2">
                {panel.title}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {panel.content}
            </Box>
          </Drawer>
        </Box>
      ))}
    </Box>
  );
};

export default AppLayout; 