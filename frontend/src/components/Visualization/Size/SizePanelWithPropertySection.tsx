import React from 'react';
import { PropertySection } from '../Properties';
import PhotoSizeSelectLargeIcon from '@mui/icons-material/PhotoSizeSelectLarge';

const SizePanelWithPropertySection: React.FC = () => {
    return (
        <PropertySection
            title="Size"
            icon={<PhotoSizeSelectLargeIcon fontSize="small" />}
            defaultExpanded={true}
            storageKey="sizePanel.expanded"
        >
            <div style={{ padding: '8px' }}>
                <p>Size configuration will go here</p>
            </div>
        </PropertySection>
    );
};

export default SizePanelWithPropertySection;