import xml.etree.ElementTree as ET
from xml.dom import minidom

def generate_full_calo_200k():
    # =========================================================================
    # 1. DADOS DE GEOMETRIA (CaloGeoConst.h)
    # =========================================================================
    
    # 0-13: Tile, 14-17: HEC, 18-25: LAr
    eta_size = [
        10, 9, 4, 5, 5, 2, 1, 1, 1, 1, 1, 1, 1, 1, # Tile
        14, 13, 12, 12,                             # HEC
        61, 451, 57, 27, 12, 216, 51, 34            # LAr
    ]

    phi_size = [
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 8, 8, # Tile
        64, 64, 64, 64,                                       # HEC
        64, 64, 256, 256, 64, 64, 256, 256                    # LAr
    ]

    # =========================================================================
    # 2. CALCULAR TOTAL DE CÉLULAS (Para normalizar o gradiente)
    # =========================================================================
    cells_per_side = 0
    for i in range(len(eta_size)):
        cells_per_side += eta_size[i] * phi_size[i]
    
    total_cells = cells_per_side * 2 # Lado A + Lado C
    print(f"Total de células calculado: {total_cells}")

    # =========================================================================
    # 3. GERAÇÃO DO XML
    # =========================================================================
    
    root = ET.Element("event", 
                      id="FULL_CYLINDER_200K", 
                      description="Simulacao completa 200k celulas - Gradiente Linear")

    count = 0
    
    # Lista de Lados: 1 = Z Positivo, -1 = Z Negativo
    sides = [-1, 1] 

    for side in sides:
        # Loop pelas camadas
        for layer in range(len(eta_size)):
            max_eta = eta_size[layer]
            max_phi = phi_size[layer]

            for eta in range(max_eta):
                for phi in range(max_phi):
                    
                    # --- LÓGICA DE COR (GRADIENTE) ---
                    # Queremos ir de Azul (Baixa Energia) -> Vermelho (Alta Energia)
                    # Mapeamos o progresso da geração (0 a total_cells) para energia.
                    
                    # Normaliza de 0.0 a 1.0
                    progress = count / total_cells
                    
                    # Energia Mínima: 10.0 (Azul profundo)
                    # Energia Máxima: 15000.0 (Vermelho intenso/Branco)
                    # Usamos uma curva exponencial leve para dar mais contraste
                    energy = 10.0 + (progress**1.2) * 14990.0
                    
                    # Cria a célula com o atributo SIDE
                    ET.SubElement(root, "cell", 
                                  side=str(side),
                                  l=str(layer), 
                                  eta=str(eta), 
                                  phi=str(phi), 
                                  e=f"{energy:.2f}")
                    
                    count += 1
                    
        print(f"Lado {'A (+)' if side==1 else 'C (-)'} concluído...")

    # =========================================================================
    # 4. SALVAR
    # =========================================================================
    print("Formatando e salvando XML...")
    # Aviso: minidom pode ser lento para 200k linhas. 
    # Se travar, podemos usar escrita direta.
    try:
        xml_str = minidom.parseString(ET.tostring(root)).toprettyxml(indent=" ")
        with open("full_200k_gradient.xml", "w") as f:
            f.write(xml_str)
    except:
        # Fallback rápido se a memória estourar no pretty print
        print("Fallback: Salvando sem formatação (arquivo muito grande)")
        tree = ET.ElementTree(root)
        tree.write("full_200k_gradient.xml")
        
    print(f"Sucesso! {count} células geradas em 'full_200k_gradient.xml'")

if __name__ == "__main__":
    generate_full_calo_200k()