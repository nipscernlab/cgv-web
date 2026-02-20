#!/usr/bin/env python3
"""
CGV Web Project Documentation Generator
=====================================

This script automatically generates comprehensive documentation for the CGV Web project,
including project overview, architecture analysis, code snippets, and data flow explanations.

Usage:
    python generate_project_docs.py

Output:
    - CGV_Web_Documentation.md (comprehensive project documentation)
    - console output with generation summary
"""

import os
import re
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional

class CGVDocumentationGenerator:
    """Generates comprehensive documentation for the CGV Web project."""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.docs = []
        self.code_snippets = {}
        self.file_structure = {}
        
    def analyze_project_structure(self) -> Dict:
        """Analyze the project file structure and categorize files."""
        structure = {
            'frontend': {
                'html': [],
                'css': [],
                'javascript': [],
                'assets': []
            },
            'backend': {
                'rust': [],
                'wasm': [],
                'config': []
            },
            'data': {
                'examples': [],
                'samples': []
            },
            'docs': {
                'readme': [],
                'other': []
            }
        }
        
        for file_path in self.project_root.rglob('*'):
            if file_path.is_file() and not self._should_ignore_file(file_path):
                relative_path = file_path.relative_to(self.project_root)
                file_ext = file_path.suffix.lower()
                file_name = file_path.name
                
                if file_ext == '.html':
                    structure['frontend']['html'].append(str(relative_path))
                elif file_ext == '.css':
                    structure['frontend']['css'].append(str(relative_path))
                elif file_ext == '.js':
                    structure['frontend']['javascript'].append(str(relative_path))
                elif file_ext in ['.png', '.jpg', '.jpeg', '.svg', '.ico']:
                    structure['frontend']['assets'].append(str(relative_path))
                elif file_ext == '.rs':
                    structure['backend']['rust'].append(str(relative_path))
                elif file_ext == '.wasm':
                    structure['backend']['wasm'].append(str(relative_path))
                elif file_ext in ['.toml', '.json', '.lock']:
                    structure['backend']['config'].append(str(relative_path))
                elif file_ext == '.xml':
                    structure['data']['examples'].append(str(relative_path))
                elif file_ext == '.py':
                    structure['docs']['other'].append(str(relative_path))
                elif file_name.lower().startswith('readme'):
                    structure['docs']['readme'].append(str(relative_path))
                    
        return structure
    
    def _should_ignore_file(self, file_path: Path) -> bool:
        """Determine if a file should be ignored during analysis."""
        ignore_patterns = [
            '.git', 'node_modules', '__pycache__', '.vscode',
            'dist', 'build', 'target', '*.tmp', '*.log'
        ]
        
        return any(
            pattern in str(file_path).lower() 
            for pattern in ignore_patterns
        )
    
    def extract_code_snippets(self) -> Dict[str, str]:
        """Extract important code snippets from key files."""
        snippets = {}
        
        # JavaScript snippets
        js_files = ['main.js', 'tour.js']
        for js_file in js_files:
            file_path = self.project_root / js_file
            if file_path.exists():
                content = file_path.read_text(encoding='utf-8')
                snippets[js_file] = self._extract_js_snippets(content)
        
        # CSS snippets
        css_file = self.project_root / 'style.css'
        if css_file.exists():
            content = css_file.read_text(encoding='utf-8')
            snippets['style.css'] = self._extract_css_snippets(content)
        
        # HTML snippets
        html_file = self.project_root / 'index.html'
        if html_file.exists():
            content = html_file.read_text(encoding='utf-8')
            snippets['index.html'] = self._extract_html_snippets(content)
        
        # Rust snippets
        rust_file = self.project_root / 'src' / 'lib.rs'
        if rust_file.exists():
            content = rust_file.read_text(encoding='utf-8')
            snippets['lib.rs'] = self._extract_rust_snippets(content)
            
        return snippets
    
    def _extract_js_snippets(self, content: str) -> Dict[str, str]:
        """Extract key JavaScript code snippets."""
        snippets = {}
        
        # Extract shader code
        shader_match = re.search(r'const vertexShader = /\* glsl \*\/`(.*?)`;', content, re.DOTALL)
        if shader_match:
            snippets['vertex_shader'] = shader_match.group(1).strip()
        
        fragment_match = re.search(r'const fragmentShader = /\* glsl \*\/`(.*?)`;', content, re.DOTALL)
        if fragment_match:
            snippets['fragment_shader'] = fragment_match.group(1).strip()
        
        # Extract main functions
        functions = ['buildMesh', 'loadFile', 'enterFocus', 'exitFocus', 'enterCinema', 'exitCinema']
        for func in functions:
            func_match = re.search(f'function {func}\\(.*?\\) {{(.*?)^}}', content, re.MULTILINE | re.DOTALL)
            if func_match:
                snippets[f'{func}_function'] = func_match.group(1).strip()
        
        return snippets
    
    def _extract_css_snippets(self, content: str) -> Dict[str, str]:
        """Extract key CSS snippets."""
        snippets = {}
        
        # Extract neon slider styles
        neon_slider_match = re.search(r'/\* Vibrant neon gradient.*?\*/.*?\.grad-track.*?{.*?}', content, re.DOTALL)
        if neon_slider_match:
            snippets['neon_energy_slider'] = neon_slider_match.group(0).strip()
        
        # Extract cinema mode styles
        cinema_mode_match = re.search(r'/\* CINEMA MODE.*?\*/.*?body\.cinema-mode.*?{.*?}', content, re.DOTALL)
        if cinema_mode_match:
            snippets['cinema_mode_styles'] = cinema_mode_match.group(0).strip()
        
        return snippets
    
    def _extract_html_snippets(self, content: str) -> Dict[str, str]:
        """Extract key HTML snippets."""
        snippets = {}
        
        # Extract main structure
        head_match = re.search(r'<head>.*?</head>', content, re.DOTALL)
        if head_match:
            snippets['head_section'] = head_match.group(0).strip()
        
        # Extract HUD structure
        hud_match = re.search(r'<div id="hud">.*?</div><!-- /#hud -->', content, re.DOTALL)
        if hud_match:
            snippets['hud_structure'] = hud_match.group(0).strip()
        
        return snippets
    
    def _extract_rust_snippets(self, content: str) -> Dict[str, str]:
        """Extract key Rust code snippets."""
        snippets = {}
        
        # Extract main processing functions
        functions = ['process_xml_data', 'parse_cell_data']
        for func in functions:
            func_match = re.search(f'#\\[wasm_bindgen]\\s*pub fn {func}.*?{{(.*?)^}}', content, re.MULTILINE | re.DOTALL)
            if func_match:
                snippets[f'{func}_rust'] = func_match.group(1).strip()
        
        return snippets
    
    def analyze_data_flow(self) -> str:
        """Analyze and document the data flow in the application."""
        flow = """
# Data Flow Analysis

## XML Data Processing Pipeline

1. **File Input** → User drops/selects XML file
2. **JavaScript Handler** → `loadFile()` function called
3. **File Reading** → XML content read as text and bytes
4. **WebAssembly Processing** → `process_xml_data()` called in Rust
5. **Geometry Generation** → Cell positions, energies, colors calculated
6. **Three.js Rendering** → InstancedMesh created with GPU optimization
7. **Shader Pipeline** → Custom GLSL shaders render cells with energy-based coloring
8. **User Interaction** → Energy threshold, Z-axis clipping, sub-detector filtering

## Key Data Structures

### Cell Data (Rust → JavaScript)
```rust
pub struct CellData {
    pub count: u32,
    pub matrices: Vec<f32>,        // 4x4 transformation matrices
    pub colors: Vec<f32>,         // RGB color values
    pub energies: Option<Vec<f32>>, // Normalized energy values
    pub layers: Option<Vec<u8>>,   // Layer indices (0-25)
    pub etas: Option<Vec<u16>>,    // Pseudorapidity values
    pub phis: Option<Vec<u16>>,    // Azimuthal angle values
    pub min_energy: f32,
    pub max_energy: f32,
}
```

### Shader Uniforms
```javascript
const shaderUniforms = {
    u_threshold: { value: 0.0 },  // Energy threshold
    u_time:      { value: 0.0 },  // Animation time
    u_highlight: { value: -1.0 }, // Hovered cell ID
};
```

## Rendering Pipeline

1. **Vertex Shader**: Applies cell transformations and passes data to fragment shader
2. **Fragment Shader**: Energy-based coloring with lighting and hover effects
3. **Post-processing**: Bloom effect and anti-aliasing
4. **Wireframe Overlay**: Optimized LineSegments for edge rendering

## User Interaction Flow

1. **Mouse Movement** → Raycaster detects cell under cursor
2. **Energy Slider** → Updates `u_threshold` uniform in real-time
3. **Z-Axis Clip** → Updates clipping planes in renderer
4. **Sub-detector Toggles** → Updates cell visibility flags
5. **Cinema/Focus Mode** → CSS transitions + auto-rotation control
"""
        return flow
    
    def generate_architecture_overview(self) -> str:
        """Generate comprehensive architecture overview."""
        return """
# Architecture Overview

## Technology Stack

### Frontend (Browser)
- **Three.js** - 3D graphics rendering engine
- **WebGL** - GPU-accelerated graphics
- **GLSL Shaders** - Custom cell rendering
- **Vite** - Build tool and development server
- **Lucide Icons** - UI icon system

### Backend (WebAssembly)
- **Rust** - High-performance XML parsing
- **wasm-bindgen** - JavaScript/Rust interoperability
- **quick-xml** - Streaming XML parser
- **Serde** - Serialization/deserialization

### Data Processing
- **ATLAS Calorimeter XML** - Particle physics event data
- **InstancedMesh** - GPU-optimized rendering for 100k+ cells
- **Custom Shaders** - Energy-based visualization

## System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Browser UI    │◄──►│   JavaScript     │◄──►│   WebAssembly   │
│                 │    │                  │    │                  │
│ • Three.js      │    │ • Scene Management│    │ • XML Parsing    │
│ • User Controls │    │ • Event Handling  │    │ • Data Processing│
│ • CSS Animations│    │ • Shader Uniforms │    │ • Memory Management│
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   WebGL Pipeline │    │   Data Flow      │    │   Physics Data   │
│                 │    │                  │    │                  │
│ • Vertex Shader  │    │ • XML → Rust      │    │ • ATLAS Events   │
│ • Fragment Shader│    │ • Rust → JS      │    │ • Cell Energies  │
│ • Post-processing│    │ • JS → GPU       │    │ • Geometry Data  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Performance Optimizations

### GPU Optimization
- **Instanced Rendering**: Single draw call for 100k+ cells
- **Custom Shaders**: Energy-based coloring on GPU
- **Frustum Culling**: Automatic Three.js optimization
- **Level of Detail**: Adaptive rendering based on camera distance

### Memory Management
- **Streaming XML Parser**: Minimal memory footprint
- **Typed Arrays**: Efficient binary data transfer
- **Object Pooling**: Reuse of Three.js objects
- **Garbage Collection**: Manual cleanup of geometries/materials

### Rendering Pipeline
- **Single Pass**: Most effects in one render pass
- **Bloom Optimization**: Reduced strength for performance
- **Anti-aliasing**: SMAA for quality/performance balance
- **Dynamic Clipping**: Z-axis slicing without reprocessing

## Component Architecture

### Core Components

1. **SceneManager** (`main.js`)
   - Three.js scene setup and management
   - Camera and lighting configuration
   - Render loop and animation system

2. **DataProcessor** (`src/lib.rs`)
   - XML parsing and validation
   - Cell geometry calculation
   - Energy normalization and color mapping

3. **UIController** (`main.js`)
   - User input handling
   - Energy threshold management
   - Cinema/focus mode transitions

4. **ShaderSystem** (`main.js`)
   - GLSL shader compilation
   - Uniform management
   - Real-time parameter updates

### Data Models

```javascript
// Cell rendering data
interface CellRenderData {
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale: THREE.Vector3,
    energy: number,
    color: THREE.Color,
    layer: number,
    detector: 'tile' | 'hec' | 'lar'
}

// UI State
interface UIState {
    cinemaMode: boolean,
    focusMode: boolean,
    energyThreshold: number,
    zClipDepth: number,
    activeDetectors: Set<string>,
    wireframeMode: boolean
}
```
"""
    
    def generate_documentation(self) -> str:
        """Generate the complete documentation."""
        structure = self.analyze_project_structure()
        snippets = self.extract_code_snippets()
        
        doc = f"""# CGV Web - Complete Project Documentation

*Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Overview](#architecture-overview)
3. [Data Flow Analysis](#data-flow-analysis)
4. [File Structure](#file-structure)
5. [Key Components](#key-components)
6. [Code Snippets](#code-snippets)
7. [User Interface](#user-interface)
8. [Performance Considerations](#performance-considerations)
9. [Development Guide](#development-guide)
10. [Deployment](#deployment)

---

## Project Overview

CGV Web (Calorimeter Geometry Viewer) is a browser-based 3D visualization tool for ATLAS calorimeter data from CERN's Large Hadron Collider. The application allows physicists, students, and the public to explore real particle physics events in an interactive, scientifically accurate 3D environment.

### Key Features

- **Real-time 3D Visualization**: Display 100,000+ calorimeter cells with energy-based coloring
- **Interactive Controls**: Energy threshold filtering, Z-axis slicing, sub-detector toggles
- **Cinema Mode**: Fullscreen auto-rotation for presentations and outreach
- **High Performance**: WebAssembly-powered XML parsing with GPU-accelerated rendering
- **Scientific Accuracy**: ATLAS detector geometry and physics data visualization

### Technical Highlights

- **WebAssembly Integration**: Rust-based XML parser for high-performance data processing
- **Custom GLSL Shaders**: Energy-proportional cell coloring with hover effects
- **Optimized Rendering**: InstancedMesh for efficient large-scale visualization
- **Responsive Design**: Modern UI with smooth animations and transitions

---

""" + self.generate_architecture_overview() + "\n---\n\n" + self.analyze_data_flow() + """

---

## File Structure

### Frontend Components

**HTML Files:**
""" + "\n".join(f"- {file}" for file in structure['frontend']['html']) + """

**CSS Files:**
""" + "\n".join(f"- {file}" for file in structure['frontend']['css']) + """

**JavaScript Files:**
""" + "\n".join(f"- {file}" for file in structure['frontend']['javascript']) + """

**Assets:**
""" + "\n".join(f"- {file}" for file in structure['frontend']['assets']) + """

### Backend Components

**Rust Source:**
""" + "\n".join(f"- {file}" for file in structure['backend']['rust']) + """

**WebAssembly:**
""" + "\n".join(f"- {file}" for file in structure['backend']['wasm']) + """

**Configuration:**
""" + "\n".join(f"- {file}" for file in structure['backend']['config']) + """

### Data Files

**Example Data:**
""" + "\n".join(f"- {file}" for file in structure['data']['examples']) + """

---

## Key Components

### 1. Main Application (`main.js`)

The core JavaScript module that orchestrates the entire application:

- **Scene Management**: Three.js setup, lighting, camera controls
- **Data Processing**: WebAssembly integration and mesh building
- **User Interface**: Event handling, UI state management
- **Rendering Loop**: Animation and shader updates

### 2. WebAssembly Module (`src/lib.rs`)

High-performance Rust code for data processing:

- **XML Parsing**: Streaming parser for large event files
- **Geometry Calculation**: Cell position and transformation computation
- **Data Validation**: Energy range checking and error handling

### 3. Shader System

Custom GLSL shaders for scientific visualization:

- **Vertex Shader**: Cell positioning and data passing
- **Fragment Shader**: Energy-based coloring with lighting effects
- **Uniform Management**: Real-time parameter updates

### 4. User Interface (`index.html`, `style.css`)

Modern, responsive web interface:

- **Semantic HTML**: Accessible structure with ARIA labels
- **CSS Animations**: Smooth transitions and hover effects
- **Component Architecture**: Modular UI elements

---

## Code Snippets

### Vertex Shader (GLSL)
```glsl
""" + snippets.get('vertex_shader', '// Shader code not found') + """

```

### Fragment Shader (GLSL)
```glsl
""" + snippets.get('fragment_shader', '// Shader code not found') + """

```

### Main Mesh Building Function
```javascript
""" + snippets.get('buildMesh_function', '// Function not found') + """

```

### Neon Energy Slider Styles
```css
""" + snippets.get('neon_energy_slider', '// CSS not found') + """

```

### Cinema Mode Implementation
```javascript
""" + snippets.get('enterCinema_function', '// Function not found') + """

```

---

## User Interface

### Main HUD Components

1. **Top Bar**: Application branding, filename display, action buttons
2. **Left Panel**: Event metadata, visualization controls, sub-detector toggles
3. **Energy Rail**: Energy threshold slider with neon gradient
4. **Focus Overlay**: Cinema mode controls and exit button

### Key Interactions

- **Drag & Drop**: File loading with visual feedback
- **Energy Slider**: Real-time threshold adjustment with tooltip
- **Z-Axis Clip**: Depth filtering with visual indicator
- **Cinema Mode**: Fullscreen presentation mode with auto-rotation
- **Keyboard Shortcuts**: F for focus mode, C for cinema, W for wireframe

### Responsive Design

- **Mobile Support**: Touch interactions and responsive layout
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support
- **Performance**: GPU-accelerated animations and transitions

---

## Performance Considerations

### Rendering Optimization

1. **Instanced Rendering**: Single draw call for 100k+ cells
2. **Frustum Culling**: Automatic Three.js optimization
3. **LOD System**: Adaptive quality based on performance
4. **Memory Management**: Efficient object pooling and cleanup

### Data Processing

1. **Streaming Parser**: Minimal memory usage for large XML files
2. **WebAssembly**: Near-native performance for data processing
3. **Typed Arrays**: Efficient binary data transfer
4. **Caching**: Intelligent caching of computed geometries

### User Experience

1. **Progressive Loading**: Smooth loading indicators
2. **Error Handling**: Graceful degradation for invalid data
3. **Responsive Feedback**: Immediate visual response to user actions
4. **Background Processing**: Non-blocking data processing

---

## Development Guide

### Getting Started

1. **Prerequisites**: Node.js, Rust, WebAssembly target
2. **Installation**: `npm install` for dependencies
3. **Build Process**: `npm run build` for production
4. **Development**: `npm run dev` for development server

### Code Organization

```
cgv-web/
├── src/              # Rust source code
│   └── lib.rs       # Main WebAssembly module
├── pkg/             # Compiled WebAssembly output
├── examples/        # Sample XML event files
├── index.html       # Main HTML page
├── style.css        # Application styles
├── main.js          # Main JavaScript application
├── tour.js          # Interactive tutorial
└── package.json     # Node.js dependencies
```

### Adding Features

1. **UI Components**: Add to HTML structure and CSS styles
2. **JavaScript Logic**: Extend main.js with new modules
3. **Data Processing**: Modify Rust code for new data types
4. **Shaders**: Update GLSL for new visual effects

### Testing

1. **Unit Tests**: Rust tests for data processing
2. **Integration Tests**: End-to-end browser testing
3. **Performance Tests**: Benchmark rendering performance
4. **Accessibility Tests**: Screen reader and keyboard navigation

---

## Deployment

### Production Build

```bash
# Build WebAssembly module
wasm-pack build --target web --out-dir pkg

# Build JavaScript bundle
npm run build

# Optimize for production
npm run optimize
```

### Hosting Requirements

- **Static Hosting**: Any static file server (GitHub Pages, Netlify, Vercel)
- **HTTPS Required**: WebAssembly requires secure context
- **CORS Headers**: Proper headers for external data loading
- **Compression**: Gzip compression for optimal loading

### Configuration

```json
{
  "build": {
    "target": "web",
    "optimization": true,
    "sourceMap": false
  },
  "server": {
    "headers": {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin"
    }
  }
}
```

---

## Scientific Context

### ATLAS Calorimeter System

The ATLAS experiment at CERN uses a multi-layer calorimeter system to measure particle energies:

- **TileCal**: Hadronic calorimeter in the barrel region (|η| < 1.7)
- **HEC**: Hadronic end-cap calorimeter (1.5 < |η| < 3.2)  
- **LAr EM**: Electromagnetic calorimeter (|η| < 3.2)

### Data Visualization

- **Energy Scale**: Logarithmic color mapping from MeV to GeV range
- **Geometry**: Accurate detector positioning and cell dimensions
- **Physics Events**: Real collision data from LHC experiments

### Educational Value

- **Particle Physics**: Visual representation of detector responses
- **Data Analysis**: Interactive exploration of event topology
- **Scientific Literacy**: Accessible visualization of complex data

---

*This documentation was automatically generated by the CGV Web Documentation Generator.*
"""

        return doc
    
    def save_documentation(self, output_path: str = "CGV_Web_Documentation.md"):
        """Save the generated documentation to a file."""
        doc_content = self.generate_documentation()
        output_file = self.project_root / output_path
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(doc_content)
        
        return output_file

def main():
    """Main execution function."""
    print("🚀 CGV Web Documentation Generator")
    print("=" * 50)
    
    # Get project root directory
    project_root = Path(__file__).parent
    
    # Initialize generator
    generator = CGVDocumentationGenerator(project_root)
    
    print("📁 Analyzing project structure...")
    structure = generator.analyze_project_structure()
    
    print("📝 Extracting code snippets...")
    snippets = generator.extract_code_snippets()
    
    print("📊 Generating documentation...")
    output_file = generator.save_documentation()
    
    print(f"✅ Documentation generated successfully!")
    print(f"📄 Output: {output_file}")
    print(f"📊 Files analyzed: {sum(len(files) for category in structure.values() for files in category.values())}")
    print(f"🎯 Code snippets extracted: {len(snippets)}")
    
    # Print summary
    print("\n📋 Documentation Summary:")
    print("- Project Overview & Architecture")
    print("- Data Flow Analysis")
    print("- File Structure Breakdown")
    print("- Key Component Documentation")
    print("- Code Snippets & Examples")
    print("- Performance Considerations")
    print("- Development & Deployment Guide")
    print("- Scientific Context")

if __name__ == "__main__":
    main()
