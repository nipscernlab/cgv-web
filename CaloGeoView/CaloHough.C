#include "TPolyLine3D.h"
#include "TPad.h"

#include "CaloHough.h"
#include "CaloGeoConst.h"
#include "CaloGeoXML.h"

#include <vector>
#include <iostream>

using namespace std;

// parameters ------------------------------------------------------------------

#define BIN_RES_RXY 100.0          // bin resolution for Hough parameter rxy (in milimeters)
#define BIN_RES_RZY 100.0          // bin resolution for Hough parameter rzy (in milimeters)
#define BIN_RES_AXY (2.0*pi/128.0) // bin resolution for Hough parameter axy (in     radian)
#define BIN_RES_AZY (2.0*pi/128.0) // bin resolution for Hough parameter azy (in     radian)

#define MAX_NCELLS 500             // max number of cells allowed to compute HT
#define MIN_NCELLS 3               // min number of cells in track
#define MIN_ENERGY 2.3             // minimal track energy

#define SHIFT_X 5000.0             // displacement in X
#define SHIFT_Z 8000.0             // displacement in Z

#define DRAW_RATIO 8000.0          // sphere to delimite track drawing

const float dist2lay[12] = {       // RoI size to each layer
                            300.0, // Barrel A
                            820.0, // Barrel BC
                            470.0, // Barrel D
                            350.0, // Extend A
                            540.0, // Extend B
                            740.0, // Extend D
                            400.0, // Cell D4
                            400.0, // Cell C9
                            500.0, // Scintillators
                            500.0, // Scintillators
                            500.0, // Scintillators
                            500.0  // Scintillators
                                 };

// constants -------------------------------------------------------------------

const float lay2r[12] = {2445.0, 3020.0, 3650.0, 2445.0, 2870.0, 3500.0, 3650.0, 3220.0, 2795.5, 2468.5, 2095.0, 1675.0};

const float volume[12][10] = {{0.240731, 0.243141, 0.247983, 0.255308, 0.265187, 0.277721, 0.293036, 0.311281, 0.332643, 0.304876},
                              {1.000000, 1.010010, 1.030130, 1.060550, 1.101590, 1.153660, 1.217270, 1.207590, 0.496545, 0.000000},
                              {1.453710, 1.482880, 1.571570, 1.723320, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000},
                              {0.128897, 0.454034, 0.494886, 0.540691, 0.927814, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000},
                              {0.550315, 1.002610, 1.089750, 1.187820, 1.376040, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000},
                              {3.644760, 4.149040, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000},
                              {0.614314, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000},
                              {0.174826, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000},
                              {0.016742, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000},
                              {0.016742, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000},
                              {0.008213, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000},
                              {0.008213, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000}};

// variables -------------------------------------------------------------------

vector<CellInfo> ci;
vector<TPolyLine3D *> track_hough;

// inner functions -------------------------------------------------------------

double eta2rad(float eta)
{
	return pi/2.0 - 2.0*atan(exp(-eta));
}

bool cart2hough(float x1, float y1, float x2, float y2, double &raio, double &angu)
{
	// if the points are the same, there is no line
	if (x1 == x2 && y1 == y2)
	{
		raio = x1;
		angu = y1;
		return false;
	}

	// line is vertical
	if (x1 == x2)
	{
		raio = fabs(x1);

		if (x1 > 0) angu = 0.0; else angu = pi;
		angu = angu - pi;
		if (angu < 0) angu = 2.0*pi + angu;

		return true;
	}

	// line is horizontal
	if (y1 == y2)
	{
		raio = fabs(y1);

		if (y1 > 0) angu = pi/2.0; else angu = 3.0*pi/2.0;
		angu = angu - pi;
		if (angu < 0) angu = 2.0*pi + angu;

		return true;
	}

	double a = (y1-y2)/(x1-x2);
	double b = y1 - a*x1;

	raio   = fabs(b)/sqrt(a*a + 1.0);

	if      (a < 0 && b > 0) angu = atan(a) + pi/2.0;
	else if (a > 0 && b < 0) angu = atan(a) - pi/2.0;
	else if (a < 0 && b < 0) angu = atan(a) - pi/2.0;
	else                     angu = atan(a) + pi/2.0;

	angu = angu - pi;
	if (angu < 0) angu = 2.0*pi + angu;

	return true;
}

void drawtrack(float x1, float y1, float z1, float x2, float y2, float z2)
{
	track_hough.push_back(new TPolyLine3D(2));

	track_hough[track_hough.size()-1]->SetLineWidth(2);
	track_hough[track_hough.size()-1]->SetPoint(0, x1, y1, z1);
	track_hough[track_hough.size()-1]->SetPoint(1, x2, y2, z2);
	track_hough[track_hough.size()-1]->Draw();

	gPad->Update();
}

void cgvClearHough()
{
	for (unsigned int i = 0; i < track_hough.size(); i++) delete track_hough[i];
	track_hough.clear();
	gPad->Update();
}

double dist2line(CellInfo &ci,double *pos, double *w)
{
	float v[3], d[3];

	v[0] = ci.x - pos[0];
	v[1] = ci.y - pos[1];
	v[2] = ci.z - pos[2];

	d[0] = v[1]*w[2] - w[1]*v[2];
	d[1] = w[0]*v[2] - v[0]*w[2];
	d[2] = v[0]*w[1] - w[0]*v[1];

	return sqrt(d[0]*d[0] + d[1]*d[1] + d[2]*d[2]);
}

void points2dir(CellInfo &ci1, CellInfo &ci2, double *w)
{
	w[0] = ci1.x-ci2.x;
	w[1] = ci1.y-ci2.y;
	w[2] = ci1.z-ci2.z;

	double mod = sqrt(w[0]*w[0] + w[1]*w[1] + w[2]*w[2]);
	w[0] /= mod; w[1] /= mod; w[2] /= mod;
}

// count number of cells inside RoI (line between two cells)
int CntCells(int index1, int index2, double &skew)
{

	int size = (int)ci.size();
	double dist;

	// compute direction -------------------------------------------------------

	double p[3] = {ci[index1].x, ci[index1].y, ci[index1].z};
	double w[3];
	points2dir(ci[index1], ci[index2], w);

	// find number of cells inside RoI -----------------------------------------

	int cnt = 0; skew = 0.0;
	for (int i = 0; i < size; i++)
	{
		if (!ci[i].use) continue;

		dist = dist2line(ci[i], p,w);
		if ( dist < dist2lay[ci[i].lay]*0.5 && i != index1 && i != index2)
		{
			cnt++;
			skew += dist;
		}
	}
	skew /= cnt;

	return cnt;
}

// build vector of CellInfo with all cells above threshold
unsigned int BuildCIVector(float thresh, float th_max, bool use_max)
{
	int i, j, k, n;
	float energy, r;

	float ***ene[2] = {energyp, energyn};
	float ***eta[2] = {etap   ,    etan};
	float ***phi[2] = {phip   ,    phin};

	ci.clear();

	for (i = 0; i < 12; i++)
	{
		for (j = 0; j < eta_size[i]; j++)
		{
			for (k = 0; k < phi_size[i]; k++)
			{
				for (n = 0; n < 2; n++)
				{

					// use only cells above threshold --------------------------

					energy = ene[n][i][j][k];
					if (energy < thresh           ) continue;
					if (energy > th_max && use_max) continue;

					// transform lay, eta, phi to x, y, z ----------------------

					if (i == 1 && j == 8) r = 2774.674; else r = lay2r[i];

					CellInfo cell;
					cell.x = r*cos(pi     -         phi[n][i][j][k]) + SHIFT_X;
					cell.y = r*sin(pi     -         phi[n][i][j][k]);
					cell.z = r/tan(pi/2.0 - eta2rad(eta[n][i][j][k]))+ SHIFT_Z;

					cell.lay = i;

					// get energy and energy/volume ratio ----------------------

					cell.e  = energy;
					cell.ev = energy/volume[i][j];

					cell.use    = true;
					cell.is_out = true;

					ci.push_back(cell);
				}
			}
		}
	}

	return ci.size();
}

// get the line between two cells with the highest number of cells inside RoI
bool GuessTrack(int &index1, int &index2)
{
	int i, j;
	int NPoints = (int)ci.size();

	double skew, skew_min = 999999999.9;
	int     cnt,  cnt_max = 0;

	for (i = 0; i < NPoints; i++)
	{
		for (j = 0; j < NPoints; j++)
		{
			if (i > j)
			{
				if (ci[i].use && ci[j].use)
				{
					cnt = CntCells(i, j, skew);
					if (cnt > cnt_max || ( cnt == cnt_max && skew < skew_min) )
					{
						cnt_max  =  cnt;
						skew_min = skew;
						index1   =    i;
						index2   =    j;
					}
				}
			}
		}
	}

	return (cnt_max >= MIN_NCELLS);
}

// select cells that are inside RoI
float SelectCells(double *p, double *w)
{
	int NPoints = (int)ci.size();
	float toten = 0.0;

	for (int i = 0; i < NPoints; i++)
	{
		if ( ci[i].use == false || dist2line(ci[i], p ,w) > dist2lay[ci[i].lay] )
		{
			ci[i].is_out = true;
		}
		else
		{
			ci[i].is_out = false;
			ci[i].use    = false;

			toten += ci[i].e;
		}
	}

	return toten;
}

// if line is close to horizontal in plane zy, it should be halo event
bool IsHaloMuon(double azy)
{
	if ( (azy > 1.0*pi/2.0 - 6.0*BIN_RES_AZY && azy < 1.0*pi/2.0 + 6.0*BIN_RES_AZY) ||
	     (azy > 3.0*pi/2.0 - 6.0*BIN_RES_AZY && azy < 3.0*pi/2.0 + 6.0*BIN_RES_AZY))
	     return  true;
	else return false;
}

void DoHough(double &rxy, double &axy, double &rzy, double &azy, bool has_xy)
{
	int i, j;

	// dont need to compute other iteration for Halo events
	if ( (!has_xy) || IsHaloMuon(azy)) return;

	float nminrxy = rxy -4.0*BIN_RES_RXY;
	float nmaxrxy = rxy +4.0*BIN_RES_RXY;
	float nminaxy = axy -4.0*BIN_RES_AXY;
	float nmaxaxy = axy +4.0*BIN_RES_AXY;
	float nminrzy = rzy -5.0*BIN_RES_RZY;
	float nmaxrzy = rzy +5.0*BIN_RES_RZY;
	float nminazy = azy -5.0*BIN_RES_AZY;
	float nmaxazy = azy +5.0*BIN_RES_AZY;

	float weight;
	float aw   = 0.0;
	float arxy = 0.0;
	float aaxy = 0.0;
	float arzy = 0.0;
	float aazy = 0.0;

	int NPoints = (int)ci.size();
	for (i = 0; i < NPoints; i++)
	{
		for (j = 0; j < NPoints; j++)
		{
			if (i > j)
			{
				if (!cart2hough(ci[i].x, ci[i].y, ci[j].x, ci[j].y, rxy, axy)) continue;
				if (!cart2hough(ci[i].z, ci[i].y, ci[j].z, ci[j].y, rzy, azy)) continue;

				if (rxy < nminrxy || rxy > nmaxrxy || axy < nminaxy || axy > nmaxaxy ||
				    rzy < nminrzy || rzy > nmaxrzy || azy < nminazy || azy > nmaxazy   ) continue;

				weight = ci[i].ev*ci[j].ev;

				arxy += rxy*weight;
				aaxy += axy*weight;
				arzy += rzy*weight;
				aazy += azy*weight;
				aw   += weight;
			}
		}
	}

	rxy = arxy/aw;
	axy = aaxy/aw;
	rzy = arzy/aw;
	azy = aazy/aw;
}

void drawtrack(double rxy, double axy, double rzy, double azy, bool has_xy)
{
		float x1, y1, z1;
		float x2, y2, z2;

		axy += pi;
		azy += pi;

		if (!has_xy) // horizontal line in plane ZY (Halo Muon)
		{
			x1 = rxy - SHIFT_X; x2 = x1;
			y1 = axy;           y2 = y1;
			z1 = -DRAW_RATIO;
			z2 = +DRAW_RATIO;
		}
		else
		{
			y1 =  1.0;
			x1 = (rxy - y1*sin(axy))/cos(axy) - SHIFT_X;
			z1 = (rzy - y1*sin(azy))/cos(azy) - SHIFT_Z;

			y2 = -1.0;
			x2 = (rxy - y2*sin(axy))/cos(axy) - SHIFT_X;
			z2 = (rzy - y2*sin(azy))/cos(azy) - SHIFT_Z;
		}

		// limit the track inside a sphere -------------------------------------

		double a  = (x2 - x1)*(x2 - x1) + (y2 - y1)*(y2 - y1) + (z2 - z1)*(z2 - z1);
		double b  = 2.0*( x1*(x2-x1) + y1*(y2-y1) + z1*(z2-z1) );
		double c  = x1*x1 + y1*y1 + z1*z1 - DRAW_RATIO*DRAW_RATIO;
		double u1 = (-b + sqrt(b*b - 4.0*a*c))/(2.0*a);
		double u2 = (-b - sqrt(b*b - 4.0*a*c))/(2.0*a);

		double X1 = x1 + u1*(x2-x1);
		double X2 = x1 + u2*(x2-x1);
		double Y1 = y1 + u1*(y2-y1);
		double Y2 = y1 + u2*(y2-y1);
		double Z1 = z1 + u1*(z2-z1);
		double Z2 = z1 + u2*(z2-z1);

		drawtrack(X1, Y1, Z1, X2, Y2, Z2);
}

void cgvComputeHough(float thresh, float th_max, bool use_max)
{

	// Clear previous tracks ---------------------------------------------------

	cgvClearHough();

	// Build vector with cells above threshold ---------------------------------

	int NPoints = (int)BuildCIVector(thresh, th_max, use_max);
	if (NPoints > MAX_NCELLS) return;

	// loop to find tracks -----------------------------------------------------

	while(1)
	{

		// Get direction with maximum number of cells --------------------------

		int index1, index2;
		if (!GuessTrack(index1, index2)) return;

		// select cells which belong to the track ------------------------------

		double p[3] = {ci[index1].x, ci[index1].y, ci[index1].z};
		double w[3];
		points2dir(ci[index1],ci[index2],w);

		float en = SelectCells(p,w);
		if (en < MIN_ENERGY) continue;

		// compute reference direction -----------------------------------------

		double rxy, axy, rzy, azy;
		bool has_xy = cart2hough(ci[index1].x, ci[index1].y, ci[index2].x, ci[index2].y, rxy, axy);
		              cart2hough(ci[index1].z, ci[index1].y, ci[index2].z, ci[index2].y, rzy, azy);

		// compute Hough Transform ---------------------------------------------

		DoHough(rxy, axy, rzy, azy, has_xy);

		// Draw Track ----------------------------------------------------------

		drawtrack(rxy, axy, rzy, azy, has_xy);
	}
}
