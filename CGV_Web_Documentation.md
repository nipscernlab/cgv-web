# CGV Web - Complete Project Documentation

*Generated on 2026-02-20 13:33:45*

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

---


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


---

## File Structure

### Frontend Components

**HTML Files:**
- index.html
- old_aol\index.html
- old_cgv\index.html

**CSS Files:**
- style.css
- old_aol\style.css

**JavaScript Files:**
- main.js
- tour.js
- vite.config.js
- old_aol\app.js
- old_aol\cli.js
- old_aol\pkg\aol_web.js
- old_aol\pkg\image_compositor.js
- pkg\cgv_web.js

**Assets:**
- examples\images\aol-snapshot-1771356265730.png
- examples\images\aol-snapshot-1771356541279.png
- examples\images\cgv-1771369626061.png
- examples\images\cgv-1771369640804.png
- examples\images\cgv-1771369671316.png
- examples\images\cgv-1771369678786.png
- examples\images\cgv-1771369893097.png
- examples\images\cgv-1771369987368.png
- examples\images\cgv-1771370034460.png
- examples\images\cgv-1771370057540.png
- examples\images\cgv-1771370080888.png
- examples\images\cgv-1771411781655.png
- examples\images\cgv-1771411873795.png
- examples\images\cgv-1771411879944.png
- examples\images\cgv-1771411886252.png
- examples\images\cgv-1771411898480.png
- examples\images\cgv-1771411909827.png
- examples\images\cgv-1771411936286.png
- examples\images\cgv-1771413167939.png
- examples\images\cgv-1771413184720.png
- examples\images\cgv-1771413195084.png
- examples\images\cgv-1771413209827.png
- examples\images\cgv-1771413351982.png
- examples\images\cgv-1771413380050.png
- examples\images\cgv-1771413432992.png
- examples\images\cgv-1771413451966.png
- examples\images\cgv-1771413470709.png
- examples\images\cgv-1771413481910.png
- examples\images\cgv-1771413504142.png
- examples\images\cgv-1771413517081.png
- examples\images\cgv-1771413526073.png
- examples\images\cgv-1771413538074.png
- examples\images\cgv-1771425898118.png
- examples\images\cgv-1771427983277.png
- examples\images\cgv-1771428088937.png
- examples\images\cgv-1771428119884.png
- examples\images\cgv-1771428128293.png
- examples\images\cgv-1771429054676.png
- examples\images\cgv-1771433637993.png
- examples\images\cgv-1771433668532.png
- examples\images\cgv-1771437038327.png
- examples\images\cgv-1771437145603.png
- examples\images\cgv-1771437516117.png
- examples\images\cgv-1771437539040.png
- examples\images\cgv-1771440482396.png
- examples\images\cgv-1771520295016.png
- examples\images\cgv-1771533447823.png
- examples\images\cgv-1771533827839.png
- examples\images\cgv-1771533946766.png
- examples\images\cgv-1771533961027.png
- examples\images\cgv-snapshot-1771333269423.png
- examples\images\cgv-snapshot-1771334052916.png
- examples\images\cgv-snapshot-1771334332228.png
- examples\images\cgv-snapshot-1771334678546.png
- examples\images\cgv-snapshot-1771335071331.png
- examples\images\cgv-snapshot-1771335100623.png
- examples\images\cgv-snapshot-1771335108914.png
- examples\images\cgv-snapshot-1771335117556.png
- examples\images\cgv-snapshot-1771335124735.png
- examples\images\cgv-snapshot-1771335139355.png
- examples\images\cgv-snapshot-1771335147603.png
- examples\images\cgv-snapshot-1771335151919.png
- examples\images\cgv-snapshot-1771352482952.png
- examples\images\cgv-snapshot-1771357407198.png
- examples\images\cgv-snapshot-1771363024279.png
- old_aol\emblem.svg
- old_aol\assets\atlas_emblem.jpg
- old_aol\assets\atlas_emblem_bg.png
- old_aol\assets\cern_emblem.svg
- old_aol\assets\favicon.svg
- old_aol\assets\little_heart.svg

### Backend Components

**Rust Source:**
- old_aol\src\lib.rs
- src\lib.rs

**WebAssembly:**
- old_aol\pkg\aol_web_bg.wasm
- old_aol\pkg\image_compositor_bg.wasm
- pkg\cgv_web_bg.wasm

**Configuration:**
- Cargo.lock
- Cargo.toml
- package-lock.json
- package.json
- old_aol\Cargo.lock
- old_aol\Cargo.toml
- old_aol\package-lock.json
- old_aol\package.json
- old_aol\pkg\package.json
- pkg\package.json

### Data Files

**Example Data:**
- atlas_mock_data.xml
- examples\ATLAS_Full_Axis_Check.xml
- examples\ATLAS_Full_Geometry_Spectrum.xml
- examples\atlas_stress_test.xml
- examples\atlas_test.xml
- examples\full_200k_gradient.xml
- examples\simulation_500.xml

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
// Shader code not found

```

### Fragment Shader (GLSL)
```glsl
// Shader code not found

```

### Main Mesh Building Function
```javascript
// Function not found

```

### Neon Energy Slider Styles
```css
// CSS not found

```

### Cinema Mode Implementation
```javascript
// Function not found

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
