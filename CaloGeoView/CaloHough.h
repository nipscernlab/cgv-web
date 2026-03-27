#ifndef CALOHOUGH_H
#define CALOHOUGH_H

class CellInfo
{
	public:

		float x, y, z; // position
		int   lay;     // layer
		float e, ev;   // energy and energy density
		bool  use;     // cell is enabled
		bool  is_out;  // cell is not in current track
};

void cgvClearHough  ();
void cgvComputeHough(float thresh, float th_max, bool use_max);

#endif
