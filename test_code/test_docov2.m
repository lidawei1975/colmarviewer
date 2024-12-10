

y_good = pre1;


% y_good = [zeros(10,1);pre1];

figure(3);
clf;
hold on;
plot(y_good);

for m=1:4
    
    min_error=1e100;
    n=length(y_good);
    for j=6:1:40
        x=make_x_matrix(n,j);
        y=pinv(x)*y_good;
        y=abs(y);
        % y(y<0)=0;
        peaks_pre=x*y;
        e=y_good-peaks_pre;
        error=sqrt(mean(e.*e));
        if error<min_error
            min_error=error;
            y_good_new=y;
            best_pre=peaks_pre;
            bestj=j;
        end
    end
    
    mess=sprintf('m is %d, bestj is %d error is %e and relative error is %f',m,bestj,min_error,min_error/max(y_good(:)));
    display(mess);

    y_good=y_good_new;
    if m>=1
        % plot(best_pre,'x');
        plot(y_good,'-');
    end
    

end