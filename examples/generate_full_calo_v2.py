import random
import math

# ==========================================
# CONFIGURAÇÕES DO GERADOR
# ==========================================
ARQUIVO_SAIDA = "atlas_stress_test.xml"
NUM_EVENTOS = 50           # Cuidado ao passar de 100 se for testar no navegador
PILE_UP_MEDIO = 20         # Média de colisões secundárias por evento (Pile-up)
CELULAS_POR_JATO = 150     # Quantidade de células ativadas por uma partícula primária
CELULAS_POR_PILEUP = 15    # Células ativadas por partículas de pile-up

# PDGs comuns
PDG_E_MINUS = 11
PDG_E_PLUS = -11
PDG_MUON = 13
PDG_PION = 211
PDG_PROTON = 2212

def open_xml(file):
    file.write('<?xml version="1.0" encoding="UTF-8"?>\n')
    file.write('<events>\n')

def close_xml(file):
    file.write('</events>\n')

def gerar_particula(p_id, pdg, status, charge, energy, eta, phi, time_offset=0.0):
    # Converte eta/phi/pT em px, py, pz de forma simplificada
    pt = energy / math.cosh(eta)
    px = pt * math.cos(phi)
    py = pt * math.sin(phi)
    pz = pt * math.sinh(eta)
    return f'      <particle id="{p_id}" pdg="{pdg}" status="{status}" charge="{charge}" px="{px:.2f}" py="{py:.2f}" pz="{pz:.2f}" e="{energy:.3f}" eta="{eta:.3f}" phi="{phi:.3f}" mass="0.0" vx="0.0" vy="0.0" vz="0.0" vt="{time_offset:.2f}"/>\n'

def gerar_trajetoria(p_id, eta, phi, max_z=3000):
    # Gera uma linha reta simples para a trajetória
    xml = f'    <trajectory particle_ref="{p_id}">\n'
    passos = 5
    for i in range(passos):
        z = (i / (passos - 1)) * max_z if eta > 0 else -(i / (passos - 1)) * max_z
        r = abs(z / math.sinh(eta)) if eta != 0 else max_z
        x = r * math.cos(phi)
        y = r * math.sin(phi)
        de = random.uniform(0.01, 0.5) if i > 0 else 0.0
        xml += f'      <point step="{i}" x="{x:.1f}" y="{y:.1f}" z="{z:.1f}" t="{i*1.5:.2f}" de="{de:.3f}"/>\n'
    xml += '    </trajectory>\n'
    return xml

def gerar_hits(start_hit_id, p_id, num_hits, is_pileup, eta_center, phi_center):
    hits_xml = ""
    hit_id = start_hit_id
    
    for _ in range(num_hits):
        # Distribuição de camadas baseada no main.js
        # TileCal (0-13), HEC (14-17), LAr (18-25)
        detector_rand = random.random()
        if detector_rand < 0.4:
            layer = random.randint(0, 13)
            prefix = "tile"
        elif detector_rand < 0.6:
            layer = random.randint(14, 17)
            prefix = "hec"
        else:
            layer = random.randint(18, 25)
            prefix = "lar"

        # Espalhamento ao redor da partícula original
        hit_eta = int((eta_center + random.gauss(0, 0.2)) * 10)
        hit_phi = int((phi_center + random.gauss(0, 0.5)) * 10) % 64
        
        # Energias: Pile-up tem energia baixa, partículas primárias têm energia alta/extrema
        if is_pileup:
            energy = random.uniform(0.1, 5.0) # Energia Mínima (Ruído/Pileup)
            time_ns = random.uniform(-10.0, 25.0) # Out-of-time pileup
        else:
            # Pico de energia (Brilho intenso no slider vermelho/azul)
            energy = math.exp(random.uniform(2, 7)) # Até ~1000 MeV
            time_ns = random.uniform(0.0, 5.0)      # In-time

        cell_id = f"{prefix}_{layer}_{hit_eta}_{hit_phi}"
        
        hits_xml += f'      <hit id="h{hit_id}" cell_l="{layer}" eta="{hit_eta}" phi="{hit_phi}" cell_id="{cell_id}" energy_deposit_MeV="{energy:.3f}" time_ns="{time_ns:.2f}" particle_ref="{p_id}"/>\n'
        hit_id += 1
        
    return hits_xml, hit_id

def gerar_evento(f, ev_id):
    f.write(f'  <event id="{ev_id}" run="999999" generator="PythonCustomGen" time="0.0">\n')
    f.write('    <particles>\n')
    
    part_id = 1
    hit_id = 1
    trajetorias_xml = ""
    hits_xml = "<hits>\n"
    
    # 1. GERAR PARTÍCULAS PRIMÁRIAS (Hard Scatter)
    num_primarias = random.randint(2, 6)
    for _ in range(num_primarias):
        eta = random.uniform(-2.5, 2.5)
        phi = random.uniform(0, 2 * math.pi)
        energy = random.uniform(50000, 200000) # 50 a 200 GeV
        pdg = random.choice([PDG_E_MINUS, PDG_E_PLUS, PDG_MUON, PDG_PION])
        
        f.write(gerar_particula(part_id, pdg, 1, -1, energy, eta, phi))
        trajetorias_xml += gerar_trajetoria(part_id, eta, phi)
        
        novos_hits, hit_id = gerar_hits(hit_id, part_id, CELULAS_POR_JATO, False, eta, phi)
        hits_xml += novos_hits
        part_id += 1

    # 2. GERAR PILE-UP (Colisões macias de fundo)
    num_pileup = int(random.gauss(PILE_UP_MEDIO, 5))
    for _ in range(max(0, num_pileup)):
        eta = random.uniform(-3.0, 3.0)
        phi = random.uniform(0, 2 * math.pi)
        energy = random.uniform(1000, 5000) # 1 a 5 GeV
        time_offset = random.uniform(-15.0, 15.0) # Espalhamento temporal do pileup
        
        f.write(gerar_particula(part_id, PDG_PROTON, 1, 1, energy, eta, phi, time_offset))
        
        # Pile-up costuma não deixar trajetórias longas limpas, vamos apenas focar nos hits
        novos_hits, hit_id = gerar_hits(hit_id, part_id, CELULAS_POR_PILEUP, True, eta, phi)
        hits_xml += novos_hits
        part_id += 1
        
    f.write('    </particles>\n')
    f.write(trajetorias_xml)
    f.write(hits_xml)
    f.write('    </hits>\n')
    f.write('  </event>\n')

# ==========================================
# EXECUÇÃO PRINCIPAL
# ==========================================
print(f"Iniciando geração de {NUM_EVENTOS} eventos em {ARQUIVO_SAIDA}...")
with open(ARQUIVO_SAIDA, "w") as f:
    open_xml(f)
    for ev in range(1, NUM_EVENTOS + 1):
        gerar_evento(f, ev)
        if ev % 10 == 0:
            print(f"Gerado evento {ev}/{NUM_EVENTOS}")
    close_xml(f)

print(f"Concluído! O arquivo {ARQUIVO_SAIDA} está pronto para ser carregado no site.")