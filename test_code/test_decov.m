

y_good = [
    1.0000
    2.0000
    2.8000
    3.5000
    2.8000
    2.0000
    1.0000
    ];

y_good = [
    1.0000
    2.8000
    2.8
    1.0000
    ];

for m=1:6
    

    min_error=100000;
    n=length(y_good);
    for j=1:3
        x=make_x_matrix(n,j);
        y=pinv(x)*y_good;
        peaks_pre=x*y;
        e=y_good-peaks_pre;
        error=sqrt(sum(e.*e));
        if error<min_error
            min_error=error;
            y_good_new=y;
            bestj=j;
        end
    end
    y_good=y_good_new;


    display(m);
    display(y_good);
    display(bestj);

    if length(y_good) <=1
        break;
    end

end