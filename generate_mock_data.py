#!/usr/bin/env python3
"""
ATLAS Calorimeter Mock Data Generator
====================================

Generates comprehensive mock event data for testing the CGV Web ATLAS detector viewer.
Creates hundreds of events with varying particle interactions, pile-up, and energy distributions
to test all visualization modes and geometry components.

Features:
- Generates 500+ events with realistic particle physics
- Simulates pile-up events (multiple interactions)
- Varies event density (sparse to dense)
- Ensures every ATLAS cell is hit at least once
- Spans full energy range for color mapping tests
- Includes neutrinos that pass through detector
- Realistic PDG particle types and trajectories
"""

import xml.etree.ElementTree as ET
import random
import math
from typing import List, Dict, Tuple, Set
import argparse
import os

# ATLAS Detector Configuration
TILECAL_LAYERS = [
    {'name': 'A', 'rI': 2280, 'rO': 2600, 'z_range': (-2800, 2800)},
    {'name': 'BC', 'rI': 2600, 'rO': 3440, 'z_range': (-2800, 2800)},
    {'name': 'D', 'rI': 3440, 'rO': 3820, 'z_range': (-2800, 2800)},
]

TILECAL_ETA_BARREL = [(i*0.1, (i+1)*0.1) for i in range(10)]
TILECAL_ETA_EXT = [(0.8 + i*0.1, 0.9 + i*0.1) for i in range(8)]

HEC_SEGS = [
    {'z0': 4350, 'z1': 5150, 'rI': 330, 'rO': 2100, 'eta_max': 2.5},
    {'z0': 5150, 'z1': 6050, 'rI': 370, 'rO': 2000, 'eta_max': 3.2},
]

LAR_LAYERS = [
    {'rI': 1542, 'rO': 1598, 'z_half': 3170, 'dEta': 0.003, 'label': 'S1'},
    {'rI': 1598, 'rO': 1950, 'z_half': 3170, 'dEta': 0.025, 'label': 'S2'},
    {'rI': 1950, 'rO': 2030, 'z_half': 3170, 'dEta': 0.050, 'label': 'S3'},
]

# Constants
N_PHI_TILECAL = 32
N_PHI_HEC = 16
N_PHI_LAR = 32
LAR_ETA_MAX = 2.5
MM = 1.0  # Unit conversion factor

# Particle types with realistic properties
PARTICLE_TYPES = [
    {'pdg': 11, 'name': 'electron', 'mass': 0.511, 'charge': -1, 'color': 'blue'},
    {'pdg': -11, 'name': 'positron', 'mass': 0.511, 'charge': 1, 'color': 'blue'},
    {'pdg': 13, 'name': 'muon', 'mass': 105.66, 'charge': -1, 'color': 'green'},
    {'pdg': -13, 'name': 'antimuon', 'mass': 105.66, 'charge': 1, 'color': 'green'},
    {'pdg': 211, 'name': 'pion+', 'mass': 139.57, 'charge': 1, 'color': 'red'},
    {'pdg': -211, 'name': 'pion-', 'mass': 139.57, 'charge': -1, 'color': 'red'},
    {'pdg': 321, 'name': 'kaon+', 'mass': 493.68, 'charge': 1, 'color': 'orange'},
    {'pdg': -321, 'name': 'kaon-', 'mass': 493.68, 'charge': -1, 'color': 'orange'},
    {'pdg': 2212, 'name': 'proton', 'mass': 938.27, 'charge': 1, 'color': 'purple'},
    {'pdg': -2212, 'name': 'antiproton', 'mass': 938.27, 'charge': -1, 'color': 'purple'},
    {'pdg': 22, 'name': 'photon', 'mass': 0, 'charge': 0, 'color': 'yellow'},
    {'pdg': 12, 'name': 'electron neutrino', 'mass': 0, 'charge': 0, 'color': 'gray'},
    {'pdg': -12, 'name': 'electron antineutrino', 'mass': 0, 'charge': 0, 'color': 'gray'},
    {'pdg': 14, 'name': 'muon neutrino', 'mass': 0, 'charge': 0, 'color': 'gray'},
    {'pdg': -14, 'name': 'muon antineutrino', 'mass': 0, 'charge': 0, 'color': 'gray'},
]

class AtlasCell:
    """Represents a single calorimeter cell"""
    def __init__(self, layer: int, eta: int, phi: int, det_type: int):
        self.layer = layer
        self.eta = eta
        self.phi = phi
        self.det_type = det_type
        self.energy = 0.0
        self.particle_ref = None
        
    def get_position(self) -> Tuple[float, float, float]:
        """Calculate 3D position of cell center"""
        if self.det_type == 0:  # TileCal
            layer_idx = min(self.layer // 4, len(TILECAL_LAYERS) - 1)
            layer = TILECAL_LAYERS[layer_idx]
            eta_ranges = TILECAL_ETA_BARREL if layer_idx < 2 else TILECAL_ETA_EXT
            if self.eta >= len(eta_ranges):
                return None
            eta_range = eta_ranges[self.eta]
            eta_center = (eta_range[0] + eta_range[1]) / 2
            r_center = (layer['rI'] + layer['rO']) / 2
            z_center = r_center * math.sinh(eta_center)
            phi_center = (self.phi + 0.5) * 2 * math.pi / N_PHI_TILECAL
            x = r_center * math.cos(phi_center)
            y = r_center * math.sin(phi_center)
            return (x, y, z_center)
        elif self.det_type == 1:  # HEC
            seg = HEC_SEGS[0] if self.layer < 16 else HEC_SEGS[1]
            eta_center = (self.eta + 0.5) * seg['eta_max'] / 25
            r_center = (seg['rI'] + seg['rO']) / 2
            z_center = (seg['z0'] + seg['z1']) / 2 * (1 if eta_center >= 0 else -1)
            phi_center = (self.phi + 0.5) * 2 * math.pi / N_PHI_HEC
            x = r_center * math.cos(phi_center)
            y = r_center * math.sin(phi_center)
            return (x, y, z_center)
        else:  # LAr EM
            l_idx = min(max(self.layer - 18, 0), len(LAR_LAYERS) - 1)
            layer = LAR_LAYERS[l_idx]
            eta_center = (self.eta + 0.5) * layer['dEta']
            r_center = (layer['rI'] + layer['rO']) / 2
            z_center = r_center * math.sinh(eta_center)
            phi_center = (self.phi + 0.5) * 2 * math.pi / N_PHI_LAR
            x = r_center * math.cos(phi_center)
            y = r_center * math.sin(phi_center)
            return (x, y, z_center)

class Event:
    """Represents a single physics event"""
    def __init__(self, event_id: int):
        self.event_id = event_id
        self.particles = {}
        self.trajectories = {}
        self.cells = []
        self.next_particle_id = 1
        
    def add_particle(self, pdg: int, energy: float, momentum: Tuple[float, float, float], 
                   position: Tuple[float, float, float] = (0, 0, 0)) -> int:
        """Add a particle to the event"""
        particle_id = self.next_particle_id
        self.next_particle_id += 1
        
        px, py, pz = momentum
        x, y, z = position
        
        # Calculate derived quantities
        p_mag = math.sqrt(px**2 + py**2 + pz**2)
        mass = next((p['mass'] for p in PARTICLE_TYPES if p['pdg'] == pdg), 0)
        charge = next((p['charge'] for p in PARTICLE_TYPES if p['pdg'] == pdg), 0)
        
        total_energy = math.sqrt(p_mag**2 + mass**2)
        eta = 0.5 * math.log((p_mag + pz) / (p_mag - pz)) if p_mag != pz else 0
        phi = math.atan2(py, px)
        
        particle_elem = ET.Element('particle', {
            'id': str(particle_id),
            'pdg': str(pdg),
            'status': '1',
            'charge': str(charge),
            'px': f"{px:.2f}",
            'py': f"{py:.2f}",
            'pz': f"{pz:.2f}",
            'e': f"{total_energy:.2f}",
            'eta': f"{eta:.3f}",
            'phi': f"{phi:.3f}",
            'mass': f"{mass:.3f}",
            'vx': f"{x:.1f}",
            'vy': f"{y:.1f}",
            'vz': f"{z:.1f}",
            'vt': '0'
        })
        
        self.particles[particle_id] = particle_elem
        return particle_id
    
    def add_trajectory(self, particle_id: int, points: List[Tuple[float, float, float, float]]):
        """Add trajectory points for a particle"""
        traj_elem = ET.Element('trajectory', {'particle_ref': str(particle_id)})
        
        for i, (x, y, z, de) in enumerate(points):
            point_elem = ET.Element('point', {
                'step': str(i),
                'x': f"{x:.1f}",
                'y': f"{y:.1f}",
                'z': f"{z:.1f}",
                't': f"{i * 2.5:.1f}",
                'de': f"{de:.4f}"
            })
            traj_elem.append(point_elem)
        
        self.trajectories[particle_id] = traj_elem
    
    def add_cell_hit(self, layer: int, eta: int, phi: int, energy: float, particle_id: int = None):
        """Add energy deposition in a cell"""
        cell = AtlasCell(layer, eta, phi, self.get_det_type(layer))
        cell.energy = energy
        cell.particle_ref = particle_id
        
        cell_elem = ET.Element('cell', {
            'layer': str(layer),
            'eta': str(eta),
            'phi': str(phi),
            'energy_MeV': f"{energy:.2f}"
        })
        
        if particle_id:
            cell_elem.set('particle_ref', str(particle_id))
        
        self.cells.append(cell_elem)
    
    def get_det_type(self, layer: int) -> int:
        """Get detector type from layer number"""
        if layer < 12:
            return 0  # TileCal
        elif layer < 24:
            return 1  # HEC
        else:
            return 2  # LAr EM
    
    def to_xml(self) -> ET.Element:
        """Convert event to XML element"""
        event_elem = ET.Element('event', {'id': str(self.event_id), 'run': '1'})
        
        # Add particles
        particles_elem = ET.Element('particles')
        for particle in self.particles.values():
            particles_elem.append(particle)
        event_elem.append(particles_elem)
        
        # Add trajectories
        trajectories_elem = ET.Element('trajectories')
        for traj in self.trajectories.values():
            trajectories_elem.append(traj)
        event_elem.append(trajectories_elem)
        
        # Add cells
        cells_elem = ET.Element('cells')
        for cell in self.cells:
            if isinstance(cell, ET.Element):
                # already an XML element
                cells_elem.append(cell)
            else:
                # assume AtlasCell-like object
                cells_elem.append(ET.Element('cell', {
                    'layer': str(cell.layer),
                    'eta': str(cell.eta),
                    'phi': str(cell.phi),
                    'energy_MeV': f"{cell.energy:.2f}",
                    'particle_ref': str(cell.particle_ref) if cell.particle_ref else ''
                }))
        event_elem.append(cells_elem)
        
        return event_elem

class MockDataGenerator:
    """Generates mock ATLAS data"""
    
    def __init__(self):
        self.all_cells = self._get_all_cells()
        self.hit_cells = set()
        
    def _get_all_cells(self) -> List[AtlasCell]:
        """Get list of all possible cells in the detector"""
        cells = []
        
        # TileCal cells
        for layer in range(12):
            det_type = 0
            layer_idx = layer // 4
            eta_ranges = TILECAL_ETA_BARREL if layer_idx < 2 else TILECAL_ETA_EXT
            for eta in range(len(eta_ranges)):
                for phi in range(N_PHI_TILECAL):
                    cells.append(AtlasCell(layer, eta, phi, det_type))
        
        # HEC cells
        for layer in range(12, 24):
            det_type = 1
            for eta in range(25):
                for phi in range(N_PHI_HEC):
                    cells.append(AtlasCell(layer, eta, phi, det_type))
        
        # LAr EM cells
        for layer in range(24, 26):
            det_type = 2
            l_idx = layer - 18
            layer_data = LAR_LAYERS[min(max(l_idx, 0), len(LAR_LAYERS) - 1)]
            n_eta = int(LAR_ETA_MAX / layer_data['dEta'])
            for eta in range(n_eta):
                for phi in range(N_PHI_LAR):
                    cells.append(AtlasCell(layer, eta, phi, det_type))
        
        return cells
    
    def generate_particle_shower(self, event: Event, origin: Tuple[float, float, float], 
                              direction: Tuple[float, float, float], energy: float, 
                              particle_type: Dict) -> int:
        """Generate a particle shower with realistic energy deposition"""
        particle_id = event.add_particle(
            particle_type['pdg'], energy, direction, origin
        )
        
        # Normalize direction
        dx, dy, dz = direction
        d_mag = math.sqrt(dx**2 + dy**2 + dz**2)
        if d_mag > 0:
            dx, dy, dz = dx/d_mag, dy/d_mag, dz/d_mag
        
        # Generate trajectory points
        points = []
        current_pos = list(origin)
        step_size = 200  # mm
        max_steps = 50
        
        for step in range(max_steps):
            points.append((current_pos[0], current_pos[1], current_pos[2], 
                         energy * 0.1 * math.exp(-step/10)))
            
            # Move to next position
            current_pos[0] += dx * step_size
            current_pos[1] += dy * step_size
            current_pos[2] += dz * step_size
            
            # Check if we're still in detector
            r = math.sqrt(current_pos[0]**2 + current_pos[1]**2)
            z = abs(current_pos[2])
            if r > 4200 or z > 6000:
                break
        
        event.add_trajectory(particle_id, points)
        
        # Generate cell hits along the trajectory
        for i, (x, y, z, de) in enumerate(points):
            if i % 3 == 0:  # Hit every 3rd point
                self._find_and_hit_cell(event, x, y, z, de * 100, particle_id)
        
        return particle_id
    
    def _find_and_hit_cell(self, event: Event, x: float, y: float, z: float, 
                         energy: float, particle_id: int):
        """Find the cell at given position and add energy deposition"""
        r = math.sqrt(x**2 + y**2)
        eta = 0.5 * math.log((math.sqrt(r**2 + z**2) + z) / 
                             (math.sqrt(r**2 + z**2) - z)) if r != 0 else 0
        phi = math.atan2(y, x)
        
        # Find appropriate detector and cell
        if abs(z) < 2800 and 2280 < r < 3820:  # TileCal
            layer_idx = self._get_tilecal_layer(r)
            if layer_idx is not None:
                eta_idx = self._get_tilecal_eta_index(eta, layer_idx)
                if eta_idx is not None:
                    phi_idx = int((phi + math.pi) / (2 * math.pi) * N_PHI_TILECAL) % N_PHI_TILECAL
                    layer = layer_idx * 4 + random.randint(0, 3)
                    event.add_cell_hit(layer, eta_idx, phi_idx, energy, particle_id)
                    self.hit_cells.add((layer, eta_idx, phi_idx))
        
        elif 4350 < abs(z) < 6050 and 330 < r < 2100:  # HEC
            eta_idx = min(int(abs(eta) / 3.2 * 25), 24)
            phi_idx = int((phi + math.pi) / (2 * math.pi) * N_PHI_HEC) % N_PHI_HEC
            layer = 12 + (0 if z > 0 else 6) + random.randint(0, 5)
            event.add_cell_hit(layer, eta_idx, phi_idx, energy, particle_id)
            self.hit_cells.add((layer, eta_idx, phi_idx))
        
        elif abs(z) < 3170 and 1542 < r < 2030:  # LAr EM
            l_idx = self._get_lar_layer(r)
            if l_idx is not None:
                layer_data = LAR_LAYERS[l_idx]
                eta_idx = int(abs(eta) / layer_data['dEta'])
                if eta_idx < int(LAR_ETA_MAX / layer_data['dEta']):
                    phi_idx = int((phi + math.pi) / (2 * math.pi) * N_PHI_LAR) % N_PHI_LAR
                    layer = 18 + l_idx
                    event.add_cell_hit(layer, eta_idx, phi_idx, energy, particle_id)
                    self.hit_cells.add((layer, eta_idx, phi_idx))
    
    def _get_tilecal_layer(self, r: float) -> int:
        """Get TileCal layer index from radius"""
        for i, layer in enumerate(TILECAL_LAYERS):
            if layer['rI'] < r < layer['rO']:
                return i
        return None
    
    def _get_tilecal_eta_index(self, eta: float, layer_idx: int) -> int:
        """Get TileCal eta index from pseudorapidity"""
        eta_ranges = TILECAL_ETA_BARREL if layer_idx < 2 else TILECAL_ETA_EXT
        for i, (eta_min, eta_max) in enumerate(eta_ranges):
            if eta_min <= abs(eta) < eta_max:
                return i
        return None
    
    def _get_lar_layer(self, r: float) -> int:
        """Get LAr EM layer index from radius"""
        for i, layer in enumerate(LAR_LAYERS):
            if layer['rI'] < r < layer['rO']:
                return i
        return None
    
    def generate_event(self, event_id: int, density: str = 'medium') -> Event:
        """Generate a single event with specified density"""
        event = Event(event_id)
        
        # Determine number of primary particles based on density
        if density == 'sparse':
            n_particles = random.randint(1, 3)
        elif density == 'medium':
            n_particles = random.randint(3, 8)
        else:  # dense
            n_particles = random.randint(8, 15)
        
        # Add pile-up for some events
        if random.random() < 0.3:  # 30% chance of pile-up
            n_particles += random.randint(2, 5)
        
        # Generate primary particles
        for _ in range(n_particles):
            # Random particle type (favor charged particles)
            particle_weights = [10, 10, 8, 8, 15, 15, 5, 5, 3, 3, 12, 2, 2, 2, 2]
            particle_type = random.choices(PARTICLE_TYPES, weights=particle_weights)[0]
            
            # Random origin (beam spot)
            origin = (
                random.gauss(0, 10),  # x
                random.gauss(0, 10),  # y
                random.gauss(0, 50)   # z
            )
            
            # Random direction (forward biased)
            theta = random.gauss(0, 0.3)  # Small angle from beam
            phi = random.uniform(0, 2 * math.pi)
            # Use log-normal distribution for energy (convert from log space)
            log_energy = random.gauss(4.0, 1.5)
            energy = math.exp(log_energy)  # GeV
            
            direction = (
                energy * math.sin(theta) * math.cos(phi),
                energy * math.sin(theta) * math.sin(phi),
                energy * math.cos(theta)
            )
            
            # Generate particle shower
            self.generate_particle_shower(event, origin, direction, energy * 1000, particle_type)  # Convert to MeV
        
        return event
    
    def ensure_full_coverage(self, events: List[Event]) -> List[Event]:
        """Ensure every cell is hit at least once across all events"""
        unhit_cells = set()
        for cell in self.all_cells:
            cell_key = (cell.layer, cell.eta, cell.phi)
            if cell_key not in self.hit_cells:
                unhit_cells.add(cell_key)
        
        # Add events to hit remaining cells (optimized)
        if unhit_cells:
            print(f"Adding {len(unhit_cells)} cells to ensure full coverage...")
            additional_event_id = len(events) + 1
            
            # Process in batches to avoid memory issues
            batch_size = 200
            unhit_list = list(unhit_cells)
            
            for batch_start in range(0, len(unhit_list), batch_size):
                batch = unhit_list[batch_start:batch_start + batch_size]
                event = Event(additional_event_id)
                additional_event_id += 1
                
                # Hit cells in this batch
                for layer, eta, phi in batch:
                    energy = random.uniform(10, 500)  # MeV (reduced range)
                    particle_id = event.add_particle(11, energy + 100, (0, 0, 1000), (0, 0, 0))
                    event.add_cell_hit(layer, eta, phi, energy, particle_id)
                
                if event.cells:  # Only add event if it has cells
                    events.append(event)
                
                # Progress update
                processed = min(batch_start + batch_size, len(unhit_list))
                print(f"Coverage progress: {processed}/{len(unhit_list)} cells")
        
        return events

def main():
    parser = argparse.ArgumentParser(description='Generate ATLAS mock data')
    parser.add_argument('--events', type=int, default=500, help='Number of events to generate')
    parser.add_argument('--output', type=str, default='atlas_mock_data.xml', help='Output filename')
    parser.add_argument('--seed', type=int, help='Random seed for reproducibility')
    
    args = parser.parse_args()
    
    if args.seed:
        random.seed(args.seed)
    
    print(f"Generating {args.events} ATLAS mock events...")
    
    generator = MockDataGenerator()
    events = []
    
    # Generate events with varying densities
    density_distribution = ['sparse'] * int(args.events * 0.3) + \
                        ['medium'] * int(args.events * 0.5) + \
                        ['dense'] * int(args.events * 0.2)
    
    random.shuffle(density_distribution)
    
    for i, density in enumerate(density_distribution[:args.events]):
        if (i + 1) % 50 == 0:
            print(f"Generated {i + 1}/{args.events} events...")
        
        event = generator.generate_event(i + 1, density)
        events.append(event)
    
    # Ensure full detector coverage
    events = generator.ensure_full_coverage(events)
    
    # Create XML structure
    root = ET.Element('events')
    for event in events:
        root.append(event.to_xml())
    
    # Write to file
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ", level=0)
    tree.write(args.output, encoding='utf-8', xml_declaration=True)
    
    print(f"Generated {len(events)} events with {len(generator.hit_cells)} unique cell hits")
    print(f"Output written to: {args.output}")
    print(f"File size: {os.path.getsize(args.output) / 1024 / 1024:.1f} MB")

if __name__ == '__main__':
    main()
