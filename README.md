# Data Slicer - Data Analysis Platform

A modern data analysis platform that provides intuitive visualization and querying capabilities for multiple data sources including databases and files.

## Overview

Data Slicer is a full-stack data analysis platform consisting of:

- **Frontend**: React-based web application providing interactive data visualization and exploration
- **Backend**: FastAPI-based REST API supporting multiple data source connectors and query execution

## Key Features

### Data Source Support
- **Database Connectivity**: Connect to various databases through configurable connectors
- **File Support**: Upload and analyze CSV files using integrated DuckDB engine
- **Query Generation**: Dynamic SQL query generation with pypika notation

### Visualization Capabilities
- **Interactive Charts**: Dynamic chart generation using Observable Plot
- **Multi-Chart Faceting**: Sophisticated faceting system for multi-dimensional data exploration
- **Field Classification**: Intelligent field type detection and classification system
- **Responsive Design**: Mobile-friendly interface with adaptive layouts

### Architecture
- **Frontend**: React with TypeScript, Material-UI components
- **Backend**: FastAPI with Python, supporting multiple database connectors
- **Data Processing**: DuckDB for file-based data processing
- **State Management**: Context-based state management with loading and error handling

## Getting Started

### Frontend Development
```bash
cd frontend
npm install
npm start
```

### Backend Development
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

## Documentation Structure

- [`frontend/`](./frontend/README.md) - Frontend application documentation
- [`backend/`](./backend/README.md) - Backend API and service documentation

## Contributing

Please refer to the specific frontend and backend documentation for detailed development guidelines and architecture information.