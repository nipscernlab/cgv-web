#include "TGeoVolume.h"
#include "TGeoManager.h"
#include "TGeoPcon.h"
#include "TGeoArb8.h"
#include "TGeoTube.h"
#include "TGeoMatrix.h"
#include "TGeoTrd1.h"
#include "TGeoBoolNode.h"
#include "TGeoCompositeShape.h"

#include "CaloGeoConst.h"

#include <vector>
#include <fstream>
#include <iostream>

using namespace std;

// global variables ------------------------------------------------------------

// geometry
TGeoVolume   *Calo;
TGeoMaterial *CaloMaterial;
TGeoMedium   *CaloMedium;

// auxiliar functions ----------------------------------------------------------

double eta2rad(Double_t eta)
{
	return pi/2.0 - 2.0*atan(exp(-eta));
}

// implementation --------------------------------------------------------------

void InitGeometry()
{
	// this initializes gGeoManager ROOT global variable
	new TGeoManager("C", "ATLAS Calorimeter");

	// material
	CaloMaterial = new TGeoMaterial("Calo",0,0,0);
	CaloMedium   = new TGeoMedium  ("Calo",1,CaloMaterial);

	// top volume
	Calo = gGeoManager->MakeTube("Calo", CaloMedium, 303.499, 3860.000, 6150.000);
}

void CloseGeometry()
{
	gGeoManager->SetTopVolume(Calo);
	gGeoManager->CloseGeometry();

	//gGeoManager->SetVisLevel(3);
	//Calo->Draw("ogl");
}

void BuildOutline()
{
	// materials
	TGeoMaterial *OutlineMat = new TGeoMaterial("OutlineMat",0,0,0);
	TGeoMedium   *OutlineMed = new TGeoMedium  ("OutlineMed",1,OutlineMat);
	OutlineMat->SetTransparency(85);

	// Barrel Tile + LArg
	/*TGeoVolume *LBTileLArg = gGeoManager->MakePcon("LBTileLArg", OutlineMed, 0.0, 360.0, 2);
	TGeoPcon   *pcon1 = (TGeoPcon*)(LBTileLArg->GetShape());

	pcon1->DefineSection(0,-3250.000,1481.750,3860.000);
	pcon1->DefineSection(1,+3250.000,1481.750,3860.000);

	Calo->AddNode(LBTileLArg, 0);*/

	// Barrel Tile only
	TGeoVolume *LBTile = gGeoManager->MakePcon("LBTile", OutlineMed, 0.0, 360.0, 2);
	TGeoPcon   *pcon2 = (TGeoPcon*)(LBTile->GetShape());

	pcon2->DefineSection(0,-2820.000,2290.000,3860.000);
	pcon2->DefineSection(1,+2820.000,2290.000,3860.000);

	Calo->AddNode(LBTile, 0);

	// Barrel LArg only
	/*TGeoVolume *LBLArg = gGeoManager->MakePcon("LBLArg", OutlineMed, 0.0, 360.0, 2);
	TGeoPcon   *pcon3 = (TGeoPcon*)(LBLArg->GetShape());

	pcon3->DefineSection(0,-3250.000,1481.750,2290.000);
	pcon3->DefineSection(1,+3250.000,1481.750,2290.000);

	Calo->AddNode(LBLArg, 0);*/

	// Extended Barrel Tile + HEC - eta positive
	/*TGeoVolume *EBTileHECp = gGeoManager->MakePcon("EBTileHECp", OutlineMed, 0.0, 360.0, 2);
	TGeoPcon   *pcon4 = (TGeoPcon*)(EBTileHECp->GetShape());

	pcon4->DefineSection(0,3559.500, 303.499,3860.000);
	pcon4->DefineSection(1,6150.000, 485.000,3860.000);

	Calo->AddNode(EBTileHECp, 0);*/

	// Extended Barrel Tile + HEC - eta negative
	/*TGeoVolume *EBTileHECn = gGeoManager->MakePcon("EBTileHECn", OutlineMed, 0.0, 360.0, 2);
	TGeoPcon   *pcon5 = (TGeoPcon*)(EBTileHECn->GetShape());

	pcon5->DefineSection(0,-3559.500, 303.499,3860.000);
	pcon5->DefineSection(1,-6150.000, 485.000,3860.000);

	Calo->AddNode(EBTileHECn, 0);*/

	// Extended Barrel Tile only - eta positive
	TGeoVolume *EBTilep = gGeoManager->MakePcon("EBTilep", OutlineMed, 0.0, 360.0, 2);
	TGeoPcon   *pcon6 = (TGeoPcon*)(EBTilep->GetShape());

	pcon6->DefineSection(0,3559.500, 2290.000, 3860.000);
	pcon6->DefineSection(1,6150.000, 2290.000, 3860.000);

	Calo->AddNode(EBTilep, 0);

	// Extended Barrel Tile only - eta negative
	TGeoVolume *EBTilen = gGeoManager->MakePcon("EBTilen", OutlineMed, 0.0, 360.0, 2);
	TGeoPcon   *pcon7 = (TGeoPcon*)(EBTilen->GetShape());

	pcon7->DefineSection(0,-3559.500, 2290.000, 3860.000);
	pcon7->DefineSection(1,-6150.000, 2290.000, 3860.000);

	Calo->AddNode(EBTilen, 0);

	// Extended Barrel HEC only - eta positive
	/*TGeoVolume *EBHECp = gGeoManager->MakePcon("EBHECp", OutlineMed, 0.0, 360.0, 2);
	TGeoPcon   *pcon8 = (TGeoPcon*)(EBHECp->GetShape());

	pcon8->DefineSection(0,4350.000, 372.000, 2290.000);
	pcon8->DefineSection(1,6050.000, 485.000, 2290.000);

	Calo->AddNode(EBHECp, 0);*/

	// Extended Barrel HEC only - eta negative
	/*TGeoVolume *EBHECn = gGeoManager->MakePcon("EBHECn", OutlineMed, 0.0, 360.0, 2);
	TGeoPcon   *pcon9 = (TGeoPcon*)(EBHECn->GetShape());

	pcon9->DefineSection(0,-4350.000, 372.000, 2290.000);
	pcon9->DefineSection(1,-6050.000, 485.000, 2290.000);

	Calo->AddNode(EBHECn, 0);*/

	// Ground ------------------------------------------------------------------

	// materials
	/*TGeoMaterial *GroundMat = new TGeoMaterial("GroundMat",0,0,0);
	TGeoMedium   *GroundMed = new TGeoMedium  ("GroundMed",1,GroundMat);
	GroundMat->SetTransparency(80);

	TGeoVolume *Groundpos = gGeoManager->MakeBox("Ground", GroundMed, 5000, 50, 4000);
	TGeoVolume *Groundneg = gGeoManager->MakeBox("Ground", GroundMed, 5000, 50, 4000);

	Calo->AddNode(Groundpos, 0, new TGeoTranslation(0, -5000,  4000));
	Calo->AddNode(Groundneg, 0, new TGeoTranslation(0, -5000, -4000));

	// +- signals --------------------------------------------------------------

	// materials
	TGeoMaterial *TextMat = new TGeoMaterial("TextMat",0,0,0);
	TGeoMedium   *TextMed = new TGeoMedium  ("TextMed",1,TextMat);
	TextMat->SetTransparency(40);

	TGeoVolume *I = gGeoManager->MakeBox("I", TextMed, 50, 500, 50);
	I->SetLineColor(kBlue);

	TGeoTranslation *gtP1 = new TGeoTranslation(-3000, -5000,  2000);
	TGeoTranslation *gtP2 = new TGeoTranslation(-3000, -5000,  2000);
	TGeoTranslation *gtM  = new TGeoTranslation(-3000, -5000, -2000);

	TGeoRotation *grP1 = new TGeoRotation("grP1", 0, 90, 0);
	TGeoRotation *grP2 = new TGeoRotation("grP2", 90, 0, 0);
	TGeoRotation *grM  = new TGeoRotation("grM" , 0, 90, 0);

	TGeoCombiTrans *gcP1 = new TGeoCombiTrans (*gtP1, *grP1);
	TGeoCombiTrans *gcP2 = new TGeoCombiTrans (*gtP2, *grP2);
	TGeoCombiTrans *gcM  = new TGeoCombiTrans (*gtM , *grM );

	Calo->AddNode(I, 1, gcP1);
	Calo->AddNode(I, 2, gcP2);
	Calo->AddNode(I, 3, gcM );*/

	gGeoManager->SetNsegments(64);
}

void BuildEMBarrel(Int_t layer, Int_t phi_seg, bool eta_pos, int region)
{
	// variables ---------------------------------------------------------------

	Int_t i;

	Double_t h1, h2;
	Double_t phi;
	Double_t dphi = 2.0*pi/(Double_t)phi_seg;
	Double_t dy1;
	Double_t dy2;
	Double_t eta, deta;
	Double_t dx, dx1, dx2, v[16];

	TObjArray *rot = new TObjArray(phi_seg);

	// set GeoVolumes ----------------------------------------------------------

	TString eta_sig;
	if (eta_pos) eta_sig = "p"; else eta_sig = "n";

	TGeoBBox *box = new TGeoBBox("box", 3250.000, 3250.000, 3250.000);

	// prepare phi rotations ---------------------------------------------------

	phi = dphi/2.0 + pi/2.0;
	for (i = 0; i < phi_seg; i++) 
	{
		rot->AddAt(new TGeoRotation("rot", 180.0 + phi*360.0/(2.0*pi), 90.0, -90.0), i);
		phi += dphi;
	}

	// build -------------------------------------------------------------------

	int i_min = 0;
	int i_max = LaBa_size[layer];

	// segmentation in phi is different in region 0 and region 1 of EMB1, so we need to loop over the cells in two steps
	if (layer == 1 && region == 0) { i_min =   0; i_max = 448;   }
	if (layer == 1 && region == 1) { i_min = 448; i_max = 448+3; }
	if (layer == 2 && region == 0) { i_min =   0; i_max = 56;    }
	if (layer == 2 && region == 1) { i_min =  56; i_max = 56+1;  }

	for (i = i_min; i < i_max; i++)
	{
		 eta = LaBa_eta [layer][i] - LaBa_deta[layer][i]/2.0;
		deta = LaBa_deta[layer][i];
		if (!eta_pos) eta = -eta-deta;
		h1   = LaBa_h1  [layer][i];
		h2   = LaBa_h2  [layer][i];
		
		dx1 = h1/tan(pi/2.0 - eta2rad(eta+deta)) - h1/tan(pi/2.0 - eta2rad(eta));
		dx2 = h2/tan(pi/2.0 - eta2rad(eta+deta)) - h2/tan(pi/2.0 - eta2rad(eta));
		dx  = (h2-h1)/tan(pi/2.0 - eta2rad(eta));

		dy1  = h1*tan(dphi/2.0);
		dy2  = h2*tan(dphi/2.0);

		v[ 0] =  0.0; v[ 1] = -dy1;
		v[ 2] = -dx1; v[ 3] = -dy1;
		v[ 4] = -dx1; v[ 5] = +dy1;
		v[ 6] =  0.0; v[ 7] = +dy1;

		v[ 8] = -dx;     v[ 9] = -dy2;
		v[10] = -dx-dx2; v[11] = -dy2;
		v[12] = -dx-dx2; v[13] = +dy2;
		v[14] = -dx;     v[15] = +dy2;

		TGeoArb8           *arb8     = new TGeoArb8("arb8", (h2-h1)/2.0, v);
		TGeoVolumeAssembly *etaslice = new TGeoVolumeAssembly(Form("EB_%d_%d_%s_%d", layer, region, eta_sig.Data(), i));

		phi = dphi/2.0 + pi/2.0;
		for (int j = 0; j < phi_seg; j++)
		{
			TGeoVolume *cell = gGeoManager->MakeArb8("c", CaloMedium, (h2-h1)/2.0, v);
			cell->SetLineColor(kGreen);

			TGeoCombiTrans *comb = new TGeoCombiTrans((-h1-(h2-h1)/2.0)*sin(phi), -(-h1-(h2-h1)/2.0)*cos(phi), h1/tan(pi/2.0 - eta2rad(eta)),(TGeoRotation*) rot->At(j));

			if (h2/tan(pi/2.0 - eta2rad(fabs(eta)+deta)) < 3250.000)
				etaslice->AddNode(cell, j, comb);
			else // if the cell is too big and protrudes outside the box, we need to cut it with the box
			{
				comb->RegisterYourself();

				TGeoIntersection   *boolnode = new TGeoIntersection(arb8, box , comb, NULL);
				TGeoCompositeShape *cs       = new TGeoCompositeShape("cs", boolnode);
				TGeoVolume         *cell2    = new TGeoVolume("c2",cs);
				cell2->SetLineColor(kGreen);
				cell2->SetMedium(CaloMedium);

				etaslice->AddNode(cell2, j);
			}

			phi += dphi;
		}

		Calo->AddNode(etaslice, i);
		eta += deta;
	}
}

void BuildEMEndCap(Int_t layer, Int_t phi_seg, bool eta_pos, bool inner)
{
	// variables

	Double_t v[16], dx1, dx2, dx;
	Double_t dy11, dy12;
	Double_t dy21, dy22;
	Double_t h1, h2, z;
	Double_t phi, eta, deta;
	Double_t dphi = 2.0*pi/(Double_t)phi_seg;

	TObjArray *rot = new TObjArray(phi_seg);

	// set GeoVolumes ----------------------------------------------------------

	TString eta_sig;
	if (eta_pos) eta_sig = "p"; else eta_sig = "n";
	int bec = (inner == 1) ? 3 : 2;
	
	TGeoTube *box = new TGeoTube("box", 10.0, 2034.000, 10000.0);

	gGeoManager->SetNsegments(phi_seg);

	// prepare phi rotations ---------------------------------------------------

	phi = dphi/2.0 + pi;
	for (int j = 0; j < phi_seg; j++) 
	{
		rot->AddAt(new TGeoRotation("rot", 0, 0, phi*360.0/(2.0*pi)),j);
		phi += dphi;
	}

	// build -------------------------------------------------------------------

	int i_min = 0;
	int i_max = LaEb_size[layer];

	// segmentation in phi is different in inner and outer wheel,
	// so we need to loop over the cells in two steps
	if (layer == 1 && inner == false) { i_min =   0; i_max = 216;  }
	if (layer == 1 && inner == true ) { i_min = 216; i_max = 216+7;}
	if (layer == 2 && inner == false) { i_min =   0; i_max = 44;   } // the first 44 cells - outer whell
	if (layer == 2 && inner == true ) { i_min =  44; i_max = 44+7; } // the last  7  cells - inner wheel
	
	for (int i = i_min; i < i_max; i++)
	{
		 eta = LaEb_eta [layer][i] + LaEb_deta[layer][i]/2.0;
		deta = LaEb_deta[layer][i];
		h1   = LaEb_h1  [layer][i];
		h2   = LaEb_h2  [layer][i];

		dx1 = h1*tan(pi/2.0 - eta2rad(eta)) - h1*tan(pi/2.0 - eta2rad(eta-deta));
		dx2 = h2*tan(pi/2.0 - eta2rad(eta)) - h2*tan(pi/2.0 - eta2rad(eta-deta));
		dx  = (h2-h1)*tan(pi/2.0 - eta2rad(eta));
		
		dy11 = 2*pi*h1*tan(pi/2.0 - eta2rad(eta))/(2.0*phi_seg);
		dy12 = 2*pi*h1*tan(pi/2.0 - eta2rad(eta-deta))/(2.0*phi_seg);
		dy21 = 2*pi*h2*tan(pi/2.0 - eta2rad(eta))/(2.0*phi_seg);
		dy22 = 2*pi*h2*tan(pi/2.0 - eta2rad(eta-deta))/(2.0*phi_seg);

		if (eta_pos)
		{
			v[ 6] =  0.0; v[ 7] = -dy11;
			v[ 4] = -dx1; v[ 5] = -dy12;
			v[ 2] = -dx1; v[ 3] = +dy12;
			v[ 0] =  0.0; v[ 1] = +dy11;

			v[14] = dx;     v[15] = -dy21;
			v[12] = dx-dx2; v[13] = -dy22;
			v[10] = dx-dx2; v[11] = +dy22;
			v[ 8] = dx;     v[ 9] = +dy21;
		}
		else
		{
			v[14] =  0.0; v[15] = -dy11;
			v[12] = -dx1; v[13] = -dy12;
			v[10] = -dx1; v[11] = +dy12;
			v[ 8] =  0.0; v[ 9] = +dy11;

			v[ 6] = dx;     v[ 7] = -dy21;
			v[ 4] = dx-dx2; v[ 5] = -dy22;
			v[ 2] = dx-dx2; v[ 3] = +dy22;
			v[ 0] = dx;     v[ 1] = +dy21;
		}

		TGeoArb8 *arb8               = new TGeoArb8("arb8", (h2-h1)/2.0, v);
		TGeoVolumeAssembly *etaslice = new TGeoVolumeAssembly(Form("EE_%d_%d_%s_%d", layer, bec, eta_sig.Data(), i));

		phi = dphi/2 + pi/2;
		for (int j = 0; j < phi_seg; j++)
		{
			TGeoVolume *cell = gGeoManager->MakeArb8("c", CaloMedium, (h2-h1)/2.0, v);
			cell->SetLineColor(kGreen);

			if (eta_pos) z = h1+(h2-h1)/2.0; else z = -(h1+(h2-h1)/2.0);
			TGeoCombiTrans *comb = new TGeoCombiTrans("comb", -h1*tan(pi/2.0 - eta2rad(eta))*sin(phi), h1*tan(pi/2.0 - eta2rad(eta))*cos(phi), z, (TGeoRotation*)rot->At(j));

			if (i < 3)
			{
				comb->RegisterYourself();

				TGeoIntersection   *boolnode = new TGeoIntersection(arb8, box, comb, NULL);
				TGeoCompositeShape *cs       = new TGeoCompositeShape("cs", boolnode);	
				TGeoVolume         *cell2    = new TGeoVolume("c2",cs);
				cell2->SetLineColor(kGreen);
				cell2->SetMedium(CaloMedium);

				etaslice->AddNode(cell2, j, new TGeoTranslation(0,0,0));
			}
			else
			{
				etaslice->AddNode(cell, j, comb);
			}

			phi += dphi;
		}

		Calo->AddNode(etaslice, i);
	}
}

void BuildTile(Int_t layer, Double_t h1, Double_t h2, int phi_seg, bool eta_pos)
{
	
	// variables ---------------------------------------------------------------

	int i;

	Double_t phi, dphi, z;

	TObjArray *rot = new TObjArray(phi_seg);

	// set GeoVolumes ----------------------------------------------------------

	TString eta_sig;
	if (eta_pos) eta_sig = "p"; else eta_sig = "n";

	// prepare phi rotations ---------------------------------------------------

	dphi = 2.0*pi/(float)phi_seg;
	phi = dphi/2.0 + pi/2.0;
	for (i = 0; i < phi_seg; i++) 
	{
		rot->AddAt(new TGeoRotation("rot", 180.0 + phi*360.0/(2.0*pi), 90.0, 0.0), i);
		phi += dphi;
	}

	// build -------------------------------------------------------------------

	Double_t w1 = tan(dphi/2.0)*h1;
	Double_t w2 = tan(dphi/2.0)*h2;

	for (i = 0; i < Tile_size[layer-1]; i++)
	{
		TGeoVolumeAssembly *etaslice = new TGeoVolumeAssembly(Form("T%d%s%d", layer, eta_sig.Data(), i));

		phi = dphi/2.0 + pi/2.0;
		for (int j = 0; j < phi_seg; j++)
		{
			TGeoVolume *cell = gGeoManager->MakeTrd1("c", CaloMedium, w1, w2, Tiledz[layer-1][i]/2.0, (h2-h1)/2.0);
			cell->SetLineColor(kYellow);

			if (eta_pos) z = Tilez[layer-1][i]; else z = -Tilez[layer-1][i]; 
			TGeoCombiTrans *comb = new TGeoCombiTrans("comb", -(h1+h2)/2.0*sin(phi), (h1+h2)/2.0*cos(phi), z, (TGeoRotation*)rot->At(j));
			etaslice->AddNode(cell, j, comb);

			phi += dphi;
		}

		Calo->AddNode(etaslice, i);
	}
}

void MergeTile(Int_t layer1, Int_t layer2, Double_t h1, Double_t h2, Double_t h3, bool eta_pos)
{
	
	// variables ---------------------------------------------------------------

	int i;

	Double_t phi, dphi, z;

	TObjArray *rot = new TObjArray(64);

	// set GeoVolumes ----------------------------------------------------------

	TString eta_sig;
	if (eta_pos) eta_sig = "p"; else eta_sig = "n";

	// prepare phi rotations ---------------------------------------------------

	dphi = 2.0*pi/64.0;
	phi  = dphi/2.0 + pi/2.0;

	for (i = 0; i < 64; i++) 
	{
		rot->AddAt(new TGeoRotation("rot", 180.0 + phi*360.0/(2.0*pi), 90.0, 0.0), i);
		phi += dphi;
	}

	// build -------------------------------------------------------------------

	Double_t w1 = tan(dphi/2.0)*h1;
	Double_t w2 = tan(dphi/2.0)*h2;
	Double_t w3 = tan(dphi/2.0)*h3;

	for (i = 0; i < Tile_size[layer2-1]; i++)
	{
		TGeoVolumeAssembly *etaslice = new TGeoVolumeAssembly(Form("T%d%d%s%d", layer1, layer2, eta_sig.Data(), i));

		phi = dphi/2.0 + pi/2.0;
		for (int j = 0; j < 64; j++)
		{
			TGeoTrd1 *cell1 = new TGeoTrd1("c1", w1, w2, Tiledz[layer1-1][i]/2.0, (h2-h1)/2.0 -0.001);
			TGeoTrd1 *cell2 = new TGeoTrd1("c2", w2, w3, Tiledz[layer2-1][i]/2.0 -0.001, (h3-h2)/2.0);

			if (eta_pos) z = Tilez[layer1-1][i]; else z = -Tilez[layer1-1][i]; 
			TGeoCombiTrans *comb1 = new TGeoCombiTrans("comb1", -(h1+h2)/2.0*sin(phi), (h1+h2)/2.0*cos(phi), z, (TGeoRotation*)rot->At(j));
			if (eta_pos) z = Tilez[layer2-1][i]; else z = -Tilez[layer2-1][i]; 
			TGeoCombiTrans *comb2 = new TGeoCombiTrans("comb2", -(h2+h3)/2.0*sin(phi), (h2+h3)/2.0*cos(phi), z, (TGeoRotation*)rot->At(j));

			TGeoUnion    *boolnode = new TGeoUnion(cell1, cell2, comb1, comb2);
			TGeoCompositeShape *cs = new TGeoCompositeShape("cs", boolnode);
			TGeoVolume       *cell = new TGeoVolume("c", cs);
			cell->SetLineColor(kYellow);
			cell->SetMedium(CaloMedium);

			etaslice->AddNode(cell, j);

			phi += dphi;
		}

		Calo->AddNode(etaslice, i);
	}

	// last cell ---------------------------------------------------------------

	Int_t index = Tile_size[layer1-1]-1;

	TGeoVolumeAssembly *etaslice = new TGeoVolumeAssembly(Form("T%d%d%s%d", layer1, layer2, eta_sig.Data(), index));

	phi = dphi/2.0 + pi/2.0;
	for (int j = 0; j < 64; j++)
	{
		TGeoVolume *cell = gGeoManager->MakeTrd1("c", CaloMedium, w1, w2, Tiledz[layer1-1][i]/2.0, (h2-h1)/2.0);
		cell->SetLineColor(kYellow);

		if (eta_pos) z = Tilez[layer1-1][index]; else z = -Tilez[layer1-1][index]; 
		TGeoCombiTrans *comb = new TGeoCombiTrans("comb", -(h1+h2)/2.0*sin(phi), (h1+h2)/2.0*cos(phi), z, (TGeoRotation*)rot->At(j));
		etaslice->AddNode(cell, j, comb);

		phi += dphi;
	}

	Calo->AddNode(etaslice, index);
}

void BuildHEC(Int_t layer, Int_t phi_seg, Double_t h1, Double_t h2, bool eta_pos, int region)
{
	// variables ---------------------------------------------------------------

	int i,j;

	Double_t phi, dphi, r, z;
	Double_t w1, w2;

	TObjArray *rot = new TObjArray(phi_seg);

	// set GeoVolumes ----------------------------------------------------------

	TString eta_sig;
	if (eta_pos) eta_sig = "p"; else eta_sig = "n";

	// prepare phi rotations ---------------------------------------------------

	dphi = 2.0*pi/(float)phi_seg;
	phi = dphi/2.0 + pi/2.0;
	for (i = 0; i < phi_seg; i++) 
	{
		rot->AddAt(new TGeoRotation("rot", 180.0 + phi*360.0/(2.0*pi), 90.0, 0.0), i);
		phi += dphi;
	}

	// build -------------------------------------------------------------------

	int i_min = (region == 0) ? 0  : 10;
	int i_max = (region == 0) ? 10 : 14;

	for (i = i_min; i < i_max; i++)
	{
		if (!eta_pos && HECz[layer-1][i] == 0) continue;

		r = HECz[layer-1][i];
		w2 = tan(dphi/2.0)*(HECz[layer-1][i] + HECdz[layer-1][i]/2.0);
		w1 = tan(dphi/2.0)*(HECz[layer-1][i] - HECdz[layer-1][i]/2.0);

		TGeoVolumeAssembly *etaslice = new TGeoVolumeAssembly(Form("H_%d_%d_%s_%d", layer, region, eta_sig.Data(), i));

		phi = dphi/2.0 + pi/2.0;
		for (j = 0; j < phi_seg; j++)
		{
			TGeoVolume *cell = gGeoManager->MakeTrd1("c", CaloMedium, w1, w2, (h2-h1)/2.0, HECdz[layer-1][i]/2.0);
			cell->SetLineColor(kYellow);

			if (eta_pos) z = (h1+h2)/2.0; else z = -(h1+h2)/2.0; 
			TGeoCombiTrans *comb = new TGeoCombiTrans("comb", -r*sin(phi), r*cos(phi), z, (TGeoRotation*)rot->At(j));
			etaslice->AddNode(cell, j, comb);

			phi += dphi;
		}

		Calo->AddNode(etaslice, i);
	}
}

void MergeHEC(Int_t layer1, Int_t layer2, Int_t phi_seg, Double_t h1, Double_t h2, Double_t h3, bool eta_pos, int region)
{
	// variables ---------------------------------------------------------------

	int i,j;

	Double_t phi, dphi, z;
	Double_t w1, w2, w3, w4, r1, r2;

	TObjArray *rot = new TObjArray(phi_seg);

	// set GeoVolumes ----------------------------------------------------------

	TString eta_sig;
	if (eta_pos) eta_sig = "p"; else eta_sig = "n";

	// prepare phi rotations ---------------------------------------------------

	dphi = 2.0*pi/(float)phi_seg;
	 phi = dphi/2.0 + pi/2.0;

	for (i = 0; i < phi_seg; i++)
	{
		rot->AddAt(new TGeoRotation("rot", 180.0 + phi*360.0/(2.0*pi), 90.0, 0.0), i);
		phi += dphi;
	}

	// build -------------------------------------------------------------------

	int i0 = 0;

	if (layer2 == 5 && region == 0) i0 = 1;
	if (layer2 == 7 && region == 0) i0 = 2;

	// first cell
	if (region == 0) {

	TGeoVolumeAssembly *etaslice = new TGeoVolumeAssembly(Form("H_%d%d_%d_%s_%d", layer1, layer2, region, eta_sig.Data(), i0));

	r1 = HECz[layer1-1][0];
	w2 = tan(dphi/2.0)*(HECz[layer1-1][0] + HECdz[layer1-1][0]/2.0);
	w1 = tan(dphi/2.0)*(HECz[layer1-1][0] - HECdz[layer1-1][0]/2.0);

	phi = dphi/2.0 + pi/2.0;
	for (int j = 0; j < phi_seg; j++)
	{
		TGeoVolume *cell = gGeoManager->MakeTrd1("c", CaloMedium, w1, w2, (h2-h1)/2.0, HECdz[layer1-1][0]/2.0);
		cell->SetLineColor(kYellow);

		if (eta_pos) z = (h1+h2)/2.0; else z = -(h1+h2)/2.0; 
		TGeoCombiTrans *comb = new TGeoCombiTrans("comb", -r1*sin(phi), r1*cos(phi), z, (TGeoRotation*)rot->At(j));
		etaslice->AddNode(cell, j, comb);

		phi += dphi;
	}

	Calo->AddNode(etaslice, i0);} // end of first cell

	// other cells

	int imin, imax;

	if (region == 0)
	{
		imin = 0;

		switch (layer2)
		{
			case  3: imax = 9; break;
			case  5: imax = 8; break;
			case  7: imax = 7; break;
		}
	}
	else {// region 1

		switch (layer2)
		{
			case  3: imin = 9; imax = 12; break;
			case  5: imin = 8; imax = 11; break;
			case  7: imin = 7; imax = 11; break;
		}
	}

	for (i = imin; i < imax; i++)
	{
		TGeoVolumeAssembly *etaslice = new TGeoVolumeAssembly(Form("H_%d%d_%d_%s_%d", layer1, layer2, region, eta_sig.Data(), i+1+i0));

		r1 = HECz[layer1-1][i+1];
		r2 = HECz[layer2-1][i];
		w4 = tan(dphi/2.0)*(HECz[layer2-1][i  ] + HECdz[layer2-1][i  ]/2.0);
		w3 = tan(dphi/2.0)*(HECz[layer2-1][i  ] - HECdz[layer2-1][i  ]/2.0);
		w2 = tan(dphi/2.0)*(HECz[layer1-1][i+1] + HECdz[layer1-1][i+1]/2.0);
		w1 = tan(dphi/2.0)*(HECz[layer1-1][i+1] - HECdz[layer1-1][i+1]/2.0);

		phi = dphi/2.0 + pi/2.0;
		for (j = 0; j < phi_seg; j++)
		{
			TGeoTrd1 *cell1 = new TGeoTrd1("c1", w1, w2, (h2-h1)/2.0 - 0.001, HECdz[layer1-1][i+1]/2.0);
			TGeoTrd1 *cell2 = new TGeoTrd1("c2", w3, w4, (h3-h2)/2.0 - 0.001, HECdz[layer2-1][i  ]/2.0);

			if (eta_pos) z = (h1+h2)/2.0; else z = -(h1+h2)/2.0; 
			TGeoCombiTrans *comb1 = new TGeoCombiTrans("comb1", -r1*sin(phi), r1*cos(phi), z, (TGeoRotation*)rot->At(j));
			if (eta_pos) z = (h2+h3)/2.0; else z = -(h2+h3)/2.0; 
			TGeoCombiTrans *comb2 = new TGeoCombiTrans("comb2", -r2*sin(phi), r2*cos(phi), z, (TGeoRotation*)rot->At(j));

			TGeoUnion    *boolnode = new TGeoUnion(cell1, cell2, comb1, comb2);
			TGeoCompositeShape *cs = new TGeoCompositeShape("cs", boolnode);
			TGeoVolume       *cell = new TGeoVolume("c", cs);
			cell->SetLineColor(kYellow);
			cell->SetMedium(CaloMedium);

			etaslice->AddNode(cell, j);

			phi += dphi;
		}

		Calo->AddNode(etaslice, i+1+i0);
	}
}

void CaloBuild()
{
	InitGeometry();

	BuildTile(1,    2300.000, 2600.000, 64,        true); // LBA Cell A
	BuildTile(1,    2300.000, 2600.000, 64,       false); // LBC Cell A
	MergeTile(2, 3, 2600.000, 2990.000, 3440.000,  true); // LBA Cell BC
	MergeTile(2, 3, 2600.000, 2990.000, 3440.000, false); // LBC Cell BC
	BuildTile(4,    3440.000, 3820.000, 64,        true);
	BuildTile(4,    3440.000, 3820.000, 64,       false);
	BuildTile(5,    2300.000, 2600.000, 64,        true);
	BuildTile(5,    2300.000, 2600.000, 64,       false);
	BuildTile(6,    2600.000, 3140.000, 64,        true);
	BuildTile(6,    2600.000, 3140.000, 64,       false);
	BuildTile(7,    3140.000, 3820.000, 64,        true);
	BuildTile(7,    3140.000, 3820.000, 64,       false);
	BuildTile(8,    3440.000, 3820.000, 64,        true); // LBA Cell D4
	BuildTile(8,    3440.000, 3820.000, 64,       false); // LBC Cell D4
	BuildTile(9,    2990.000, 3440.000, 64,        true); // LBA Cell C10
	BuildTile(9,    2990.000, 3440.000, 64,       false); // LBC Cell C10
	BuildTile(10,   2632.000, 2959.000, 64,        true); // LBA Cell E1
	BuildTile(10,   2632.000, 2959.000, 64,       false); // LBC CEll E1
	BuildTile(11,   2305.000, 2632.000, 64,        true); // LBA CEll E2
	BuildTile(11,   2305.000, 2632.000, 64,       false); // LBC Cell E2
	BuildTile(12,   1448.490, 2342.560, 64,        true); // LBA Cell E3    1.2 < eta < 1.6
	BuildTile(12,   1448.490, 2342.560, 64,       false); // LBC Cell E3
	BuildTile(13,   1297.710, 1448.490, 64,        true); // LBA Cell E4    1.6 < eta < 1.72
	BuildTile(13,   1297.710, 1448.490, 64,       false); // LBC Cell E4
	BuildTile(14,    426.000,  876.000,  8,        true);
	BuildTile(14,    426.000,  876.000,  8,       false);
	BuildTile(15,    153.000,  426.000,  8,        true);
	BuildTile(15,    153.000,  426.000,  8,       false);

	BuildHEC(1, 64,    4350.000, 4630.000,            true, 0);
	BuildHEC(1, 64,    4350.000, 4630.000,           false, 0);
	BuildHEC(1, 32,    4350.000, 4630.000,            true, 1); // region 1 has less phi segmentation in HEC0
	BuildHEC(1, 32,    4350.000, 4630.000,           false, 1); // region 1 has less phi segmentation in HEC0
	MergeHEC(2, 3, 64, 4630.000, 4865.000, 5100.000,  true, 0);
	MergeHEC(2, 3, 64, 4630.000, 4865.000, 5100.000, false, 0);
	MergeHEC(2, 3, 32, 4630.000, 4865.000, 5100.000,  true, 1); // region 1 has less phi segmentation in HEC1
	MergeHEC(2, 3, 32, 4630.000, 4865.000, 5100.000, false, 1); // region 1 has less phi segmentation in HEC1
	MergeHEC(4, 5, 64, 5130.000, 5360.000, 5590.000,  true, 0);
	MergeHEC(4, 5, 64, 5130.000, 5360.000, 5590.000, false, 0);
	MergeHEC(4, 5, 32, 5130.000, 5360.000, 5590.000,  true, 1); // region 1 has less phi segmentation in HEC2
	MergeHEC(4, 5, 32, 5130.000, 5360.000, 5590.000, false, 1); // region 1 has less phi segmentation in HEC2
	MergeHEC(6, 7, 64, 5590.000, 5820.000, 6050.000,  true, 0);
	MergeHEC(6, 7, 64, 5590.000, 5820.000, 6050.000, false, 0);
	MergeHEC(6, 7, 32, 5590.000, 5820.000, 6050.000,  true, 1); // region 1 has less phi segmentation in HEC3
	MergeHEC(6, 7, 32, 5590.000, 5820.000, 6050.000, false, 1); // region 1 has less phi segmentation in HEC3

	BuildEMBarrel(0,  64, true , 0);
	BuildEMBarrel(0,  64, false, 0);
	BuildEMBarrel(1,  64, true , 0);
	BuildEMBarrel(1,  64, false, 0);
	BuildEMBarrel(1, 256, true , 1); // region 1 has more phi segmentation in EMB1
	BuildEMBarrel(1, 256, false, 1); // region 1 has more phi segmentation in EMB1
	BuildEMBarrel(2, 256, true , 0);
	BuildEMBarrel(2, 256, false, 0);
	BuildEMBarrel(2, 256, true , 1);
	BuildEMBarrel(2, 256, false, 1);
	BuildEMBarrel(3, 256, true , 0);
	BuildEMBarrel(3, 256, false, 0);

	BuildEMEndCap(0,  64, true , false);
	BuildEMEndCap(0,  64, false, false);
	BuildEMEndCap(1,  64, true , false);
	BuildEMEndCap(1,  64, false, false);
	BuildEMEndCap(1,  64, true , true );
	BuildEMEndCap(1,  64, false, true );
	BuildEMEndCap(2, 256, true , false);
	BuildEMEndCap(2, 256, false, false);
	BuildEMEndCap(2,  64, true , true ); // inner wheel has less phi segmentation in EME2
	BuildEMEndCap(2,  64, false, true ); // inner wheel has less phi segmentation in EME2
	BuildEMEndCap(3, 256, true , false);
	BuildEMEndCap(3, 256, false, false);

	BuildOutline();

	CloseGeometry();
	gGeoManager->Export("CaloGeometry.root");
	
	//gGeoManager->SetMaxVisNodes(500000);
	//Calo->Draw("ogl");
}
